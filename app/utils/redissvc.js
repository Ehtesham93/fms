import { createCluster } from "redis";
import FabErr from "./faberr.js";

export const ErrConnect = new FabErr(
  "ERR_CONNECT",
  null,
  "redis connect error"
);
export const ErrGet = new FabErr("ERR_GET", null, "redis get error");
export const ErrSet = new FabErr("ERR_SET", null, "redis set error");
export const ErrDel = new FabErr("ERR_DEL", null, "redis del error");

export default class RedisSvc {
  constructor(redisConfig, logger) {
    this.logger = logger;
    this.client = null;
    this.config = redisConfig;
  }

  async connect() {
    try {
      if(!this.client) {
        this.client = createCluster({
          rootNodes: [
            {
              url: `redis://${this.config.host}:${this.config.port}`,
            },
          ],
          defaults: {
            socket: {
              connectTimeout: 10000,
              lazyConnect: true,
            },
          },
        });
      }
      this.client.on("error", (err) => {
        this.logger.error("Redis Cluster Error:", err);
      });

      this.client.on("connect", () => {
        this.logger.info("Redis Cluster Connected");
      });

      this.client.on("ready", () => {
        this.logger.info("Redis Cluster Ready");
      });
      if(!this.client.isOpen) {
        await this.client.connect();
      }
      return [true, null];
    } catch (error) {
      this.logger.error("Redis cluster connection error:", error);
      return [null, ErrConnect.NewWData(error)];
    }
  }

  async get(key) {
    if (typeof key === "string") {
      return this.getSingle(key);
    } else if (Array.isArray(key)) {
      return this.getList(key);
    } else {
      return [null, ErrGet.NewWData("Invalid key type")];
    }
  }

  async getSingle(key) {
    try {
      if (!this.client) {
        const [connected, error] = await this.connect();
        if (error) return [null, error];
      }

      // Try direct get first (cluster will route if key exists)
      let value = await this.client.get(key);
      if (value !== null) return [value, null];

      // If not found, search all master nodes
      const mastersMeta = this.client.masters;
      for (const nodeMeta of mastersMeta) {
        try {
          const nodeClient = await this.client.nodeClient(nodeMeta);
          value = await nodeClient.get(key);
          if (value !== null) return [value, null];
        } catch (nodeError) {
          // Ignore MOVED errors for non-existent keys - this is expected behavior
          if (nodeError.message && nodeError.message.includes("MOVED")) {
            continue; // Try next node
          }
          // For other errors, log but continue trying other nodes
          this.logger.warn(
            `Redis node error for key ${key}:`,
            nodeError.message
          );
        }
      }
      return [null, null]; // Not found
    } catch (error) {
      // Check if this is a MOVED error for a non-existent key
      if (error.message && error.message.includes("MOVED")) {
        return [null, null]; // Key doesn't exist, return null
      }

      this.logger.error("Redis get error:", error);
      return [null, ErrGet.NewWData(error)];
    }
  }

  async getList(keys) {
    try {
      if (!this.client) {
        const [connected, error] = await this.connect();
        if (error) return [null, error];
      }

      // Try to use mGet for efficiency
      let values;
      try {
        values = await this.client.mGet(keys);
      } catch (e) {
        // If mGet is not supported, fallback to individual gets
        values = await Promise.all(keys.map((key) => this.client.get(key)));
      }

      // For any value that is null, use the cluster search logic
      const result = {};
      for (let i = 0; i < keys.length; i++) {
        let value = values[i];
        if (value === null) {
          // Try searching all master nodes (same as in get)
          const mastersMeta = this.client.masters;
          for (const nodeMeta of mastersMeta) {
            try {
              const nodeClient = await this.client.nodeClient(nodeMeta);
              value = await nodeClient.get(keys[i]);
              if (value !== null) break;
            } catch (nodeError) {
              if (nodeError.message && nodeError.message.includes("MOVED")) {
                continue;
              }
              this.logger.warn(
                `Redis node error for key ${keys[i]}:`,
                nodeError.message
              );
            }
          }
        }
        result[keys[i]] = value;
      }
      return [result, null];
    } catch (error) {
      this.logger.error("Redis getList error:", error);
      return [null, ErrGet.NewWData(error)];
    }
  }

  async set(key, value, ttl = null) {
    try {
      if (!this.client) {
        const [connected, error] = await this.connect();
        if (error) return [null, error];
      }

      let result;

      // Try direct set first (cluster will route if key exists)
      try {
        if (ttl) {
          result = await this.client.setEx(key, ttl, value);
        } else {
          result = await this.client.set(key, value);
        }
        return [result, null];
      } catch (setError) {
        // If it's a MOVED error, we need to handle it
        if (setError.message && setError.message.includes("MOVED")) {
          // Extract the target node from MOVED error
          const movedMatch = setError.message.match(/MOVED (\d+) (.+):(\d+)/);
          if (movedMatch) {
            const [, slot, host, port] = movedMatch;
            try {
              // Try to set on the correct node
              const nodeClient = await this.client.nodeClient({ host, port });
              if (ttl) {
                result = await nodeClient.setEx(key, ttl, value);
              } else {
                result = await nodeClient.set(key, value);
              }
              return [result, null];
            } catch (nodeError) {
              this.logger.error(
                `Redis set error on target node ${host}:${port}:`,
                nodeError
              );
              return [null, ErrSet.NewWData(nodeError)];
            }
          }
        }
        // For other errors, throw them
        throw setError;
      }
    } catch (error) {
      this.logger.error("Redis set error:", error);
      return [null, ErrSet.NewWData(error)];
    }
  }

  async del(key) {
    try {
      if (!this.client) {
        const [connected, error] = await this.connect();
        if (error) return [null, error];
      }

      // Try direct del first
      let result = await this.client.del(key);
      if (result > 0) return [result, null];

      // If not found, search all master nodes
      let totalDeleted = 0;
      const mastersMeta = this.client.masters;
      for (const nodeMeta of mastersMeta) {
        const nodeClient = await this.client.nodeClient(nodeMeta);
        const delResult = await nodeClient.del(key);
        totalDeleted += delResult;
      }
      return [totalDeleted, null];
    } catch (error) {
      this.logger.error("Redis del error:", error);
      return [null, ErrDel.NewWData(error)];
    }
  }

  async publish(channel, message) {
    try {
      if (!this.client) {
        const [connected, error] = await this.connect();
        if (error) return [null, error];
      }

      const result = await this.client.publish(channel, message);
      return [result, null];
    } catch (error) {
      this.logger.error("Redis publish error:", error);
      return [null, error];
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.disconnect();
        this.client = null;
      }
      return [true, null];
    } catch (error) {
      this.logger.error("Redis disconnect error:", error);
      return [null, error];
    }
  }

  async health() {
    try {
      if (!this.client) {
        const [connected, error] = await this.connect();
        if (error) return [false, error];
      }
      await this.client.ping();
      return [true, null];
    } catch (error) {
      this.logger.error("Redis health check error:", error);
      return [false, error];
    }
  }
}
