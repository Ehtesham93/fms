export default class MetaSvcDB {
  /**
   *
   * @param {PgPool} pgPoolI
   */
  constructor(pgPoolI, logger) {
    this.pgPoolI = pgPoolI;
    this.logger = logger;
  }

  // Vehicle City CRUD
  async createVehicleCity(cityname) {
    try {
      // Check if cityname already exists
      let [txclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      const existingCityName = await this.isCityNameAvailable(cityname, txclient);
      if (!existingCityName.isavailable) {
        const error = new Error("City name already exists");
        error.errcode = "CITY_NAME_ALREADY_EXISTS";
        error.errdata = {
          cityname: cityname,
        };
        throw error;
      }
      let citycode = cityname.trim();
      // Check if citycode already exists
      const existingCity = await this.isCityCodeAvailable(cityname, txclient);
      if (!existingCity.isavailable) {
        citycode = `${citycode}_${Math.floor(Math.random() * 1000000)}`;
      }

      let query = `
          INSERT INTO city (citycode, cityname)
          VALUES ($1, $2)
          ON CONFLICT (cityname) DO NOTHING
          RETURNING citycode, cityname
        `;
      let result = await txclient.query(query, [
        citycode.toUpperCase(),
        cityname.toUpperCase(),
      ]);

      // If no rows returned (conflict occurred), fetch the existing city
      if (result.rows.length === 0) {
        const fetchQuery = `SELECT citycode, cityname FROM city WHERE cityname = $1`;
        result = await txclient.query(fetchQuery, [cityname.toUpperCase()]);
      }

      if (result.rows.length === 0) {
        throw new Error("Failed to create vehicle city");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }

      return {
        citycode: result.rows[0].citycode,
        cityname: result.rows[0].cityname,
      };
    } catch (error) {
      this.logger.error("createVehicleCity error: ", error);
      throw error;
    }
  }

  async isCityCodeAvailable(citycode, txclient) {
    try {
      if (!txclient) {
        let [newtxclient, err] = await this.pgPoolI.StartTransaction();
        if (err) {
          throw err;
        }
        txclient = newtxclient;
      }
      let query = `SELECT citycode FROM city WHERE citycode = $1`;
      let result = await txclient.query(query, [citycode.toUpperCase()]);
      if (!txclient) {
        let commiterr = await this.pgPoolI.TxCommit(txclient);
        if (commiterr) {
          throw commiterr;
        }
      }

      return {
        isavailable: result.rows.length === 0,
      };
    } catch (error) {
      this.logger.error("isCityCodeAvailable error: ", error);
      throw error;
    }
  }
  async updateVehicleCity(citycode, cityname) {
    try {
      let [txclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      // Check if cityname already exists
      const existingCityName = await this.isCityNameAvailable(cityname, txclient);
      if (!existingCityName.isavailable) {
        const error = new Error("City name already exists");
        error.errcode = "CITY_NAME_ALREADY_EXISTS";
        error.errdata = {
          cityname: cityname,
        };
        throw error;
      }

      let query = `UPDATE city SET cityname = $1 WHERE citycode = $2`;
      let result = await txclient.query(query, [
        cityname.toUpperCase(),
        citycode.toUpperCase(),
      ]);

      if (result.rowCount !== 1) {
        throw new Error("Failed to update vehicle city");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }

      return true;
    } catch (error) {
      this.logger.error("updateVehicleCity error: ", error);
      throw error;
    }
  }

  async deleteVehicleCity(citycode) {
    try {
      let [txclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      let query = `DELETE FROM city WHERE citycode = $1`;
      let result = await txclient.query(query, [citycode.toUpperCase()]);

      if (result.rowCount !== 1) {
        throw new Error("Failed to delete vehicle city");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }

      return true;
    } catch (error) {
      this.logger.error("deleteVehicleCity error: ", error);
      throw error;
    }
  }

  // Vehicle Dealer CRUD
  async createVehicleDealer(dealername) {
    try {
      let [txclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      // Check if dealername already exists
      const existingDealerName = await this.isDealerNameAvailable(dealername, txclient);
      if (!existingDealerName.isavailable) {
        const error = new Error("Dealer name already exists");
        error.errcode = "DEALER_NAME_ALREADY_EXISTS";
        error.errdata = {
          dealername: dealername,
        };
        throw error;
      }

      let dealercode = dealername.trim();

      // Check if dealercode already exists
      const existingDealer = await this.isDealerCodeAvailable(dealercode, txclient);
      if (!existingDealer.isavailable) {
        dealercode = `${dealercode}_${Math.floor(Math.random() * 1000000)}`;
      }

      let query = `
          INSERT INTO dealer (dealercode, dealername)
          VALUES ($1, $2)
          ON CONFLICT (dealername) DO NOTHING
          RETURNING dealercode, dealername
        `;
      let result = await txclient.query(query, [
        dealercode.toUpperCase(),
        dealername.toUpperCase(),
      ]);

      if (result.rows.length === 0) {
        const fetchdealers = `SELECT dealercode, dealername FROM dealer WHERE dealername = $1`;
        result = await txclient.query(fetchdealers, [
          dealername.toUpperCase(),
        ]);
      }

      if (result.rows.length === 0) {
        throw new Error("Failed to create vehicle dealer");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }

      return {
        dealercode: result.rows[0].dealercode,
        dealername: result.rows[0].dealername,
      };
    } catch (error) {
      this.logger.error("createVehicleDealer error: ", error);
      throw error;
    }
  }

  async isDealerCodeAvailable(dealercode, txclient) {
    if (!txclient) {
      let [newtxclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      txclient = newtxclient;
    }
    try {
      let query = `SELECT dealercode FROM dealer WHERE dealercode = $1`;
      let result = await txclient.query(query, [dealercode.toUpperCase()]);
      if (!txclient) {
        let commiterr = await this.pgPoolI.TxCommit(txclient);
        if (commiterr) {
          throw commiterr;
        }
      }

      return {
        isavailable: result.rows.length === 0,
      };
    } catch (error) {
      this.logger.error("isDealerCodeAvailable error: ", error);
      throw error;
    }
  }

  async updateVehicleDealer(dealercode, dealername) {
    try {
      let [txclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      // Check if dealername already exists
      const existingDealerName = await this.isDealerNameAvailable(dealername, txclient);
      if (!existingDealerName.isavailable) {
        const error = new Error("Dealer name already exists");
        error.errcode = "DEALER_NAME_ALREADY_EXISTS";
        error.errdata = {
          dealername: dealername,
        };
        throw error;
      }

      let query = `UPDATE dealer SET dealername = $1 WHERE dealercode = $2`;
      let result = await txclient.query(query, [
        dealername.toUpperCase(),
        dealercode.toUpperCase(),
      ]);

      if (result.rowCount !== 1) {
        throw new Error("Failed to update vehicle dealer");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }

      return true;
    } catch (error) {
      this.logger.error("updateVehicleDealer error: ", error);
      throw error;
    }
  }

  async deleteVehicleDealer(dealercode) {
    try {
      let [txclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      let query = `DELETE FROM dealer WHERE dealercode = $1`;
      let result = await txclient.query(query, [dealercode.toUpperCase()]);

      if (result.rowCount !== 1) {
        throw new Error("Failed to delete vehicle dealer");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }

      return true;
    } catch (error) {
      this.logger.error("deleteVehicleDealer error: ", error);
      throw error;
    }
  }

  // Vehicle Color CRUD
  async createVehicleColor(colorname) {
    try {
      let [txclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      // Check if colorname already exists
      const existingColorName = await this.isColorNameAvailable(colorname, txclient);
      if (!existingColorName.isavailable) {
        const error = new Error("Color name already exists");
        error.errcode = "COLOR_NAME_ALREADY_EXISTS";
        error.errdata = {
          colorname: colorname,
        };
        throw error;
      }

      let colorcode = colorname.trim();

      // Check if colorcode already exists
      const existingColor = await this.isColorCodeAvailable(colorcode, txclient);
      if (!existingColor.isavailable) {
        colorcode = `${colorcode}_${Math.floor(Math.random() * 1000000)}`;
      }

      let query = `
          INSERT INTO color (colorcode, colorname)
          VALUES ($1, $2)
          ON CONFLICT (colorname) DO NOTHING
          RETURNING colorcode, colorname
        `;
      let result = await txclient.query(query, [
        colorcode.toUpperCase(),
        colorname.toUpperCase(),
      ]);

      if (result.rows.length === 0) {
        const fetchcolor = `SELECT colorcode, colorname FROM color WHERE colorname = $1`;
        result = await txclient.query(fetchcolor, [
          colorname.toUpperCase(),
        ]);
      }

      if (result.rows.length === 0) {
        throw new Error("Failed to create vehicle color");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }

      return {
        colorcode: result.rows[0].colorcode,
        colorname: result.rows[0].colorname,
      };
    } catch (error) {
      this.logger.error("createVehicleColor error: ", error);
      throw error;
    }
  }

  async isColorCodeAvailable(colorcode, txclient) {
    if (!txclient) {
      let [newtxclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      txclient = newtxclient;
    }
    try {
      let query = `SELECT colorcode FROM color WHERE colorcode = $1`;
      let result = await txclient.query(query, [colorcode.toUpperCase()]);
      if (!txclient) {
        let commiterr = await this.pgPoolI.TxCommit(txclient);
        if (commiterr) {
          throw commiterr;
        }
      }

      return {
        isavailable: result.rows.length === 0,
      };
    } catch (error) {
      this.logger.error("isColorCodeAvailable error: ", error);
      throw error;
    }
  }

  async isColorNameAvailable(colorname, txclient) {
    if (!txclient) {
      let [newtxclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      txclient = newtxclient;
    }
    try {
      let query = `SELECT colorname FROM color WHERE colorname = $1`;
      let result = await txclient.query(query, [colorname.toUpperCase()]);
      if (!txclient) {
        let commiterr = await this.pgPoolI.TxCommit(txclient);
        if (commiterr) {
          throw commiterr;
        }
      }

      return {
        isavailable: result.rows.length === 0,
      };
    } catch (error) {
      this.logger.error("isColorNameAvailable error: ", error);
      throw error;
    }
  }

  async isCityNameAvailable(cityname, txclient) {
    try {
      if (!txclient) {
        let [newtxclient, err] = await this.pgPoolI.StartTransaction();
        if (err) {
          throw err;
        }
        txclient = newtxclient;
      }
      let query = `SELECT cityname FROM city WHERE cityname = $1`;
      let result = await txclient.query(query, [cityname.toUpperCase()]);
      if (!txclient) {
        let commiterr = await this.pgPoolI.TxCommit(txclient);
        if (commiterr) {
          throw commiterr;
        }
      }
      return {
        isavailable: result.rows.length === 0,
      };
    } catch (error) {
      this.logger.error("isCityNameAvailable error: ", error);
      throw error;
    }
  }

  async isDealerNameAvailable(dealername, txclient) {
    if (!txclient) {
      let [newtxclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      txclient = newtxclient;
    }
    try {
      let query = `SELECT dealername FROM dealer WHERE dealername = $1`;
      let result = await txclient.query(query, [dealername.toUpperCase()]);
      if (!txclient) {
        let commiterr = await this.pgPoolI.TxCommit(txclient);
        if (commiterr) {
          throw commiterr;
        }
      }
      return {
        isavailable: result.rows.length === 0,
      };
    } catch (error) {
      this.logger.error("isDealerNameAvailable error: ", error);
      throw error;
    }
  }

  async updateVehicleColor(colorcode, colorname) {
    try {
      let [txclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      // Check if colorname already exists
      const existingColorName = await this.isColorNameAvailable(colorname, txclient);
      if (!existingColorName.isavailable) {
        const error = new Error("Color name already exists");
        error.errcode = "COLOR_NAME_ALREADY_EXISTS";
        error.errdata = {
          colorname: colorname,
        };
        throw error;
      }

      let query = `UPDATE color SET colorname = $1 WHERE colorcode = $2`;
      let result = await txclient.query(query, [
        colorname.toUpperCase(),
        colorcode.toUpperCase(),
      ]);
      if (result.rowCount !== 1) {
        throw new Error("Failed to update vehicle color");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }

      return true;
    } catch (error) {
      this.logger.error("updateVehicleColor error: ", error);
      throw error;
    }
  }

  async deleteVehicleColor(colorcode) {
    try {
      let [txclient, err] = await this.pgPoolI.StartTransaction();
      if (err) {
        throw err;
      }
      let query = `DELETE FROM color WHERE colorcode = $1`;
      let result = await txclient.query(query, [colorcode.toUpperCase()]);

      if (result.rowCount !== 1) {
        throw new Error("Failed to delete vehicle color");
      }

      let commiterr = await this.pgPoolI.TxCommit(txclient);
      if (commiterr) {
        throw commiterr;
      }

      return true;
    } catch (error) {
      this.logger.error("deleteVehicleColor error: ", error);
      throw error;
    }
  }

  async getDealerByName(dealername) {
    try {
      let query = `SELECT dealercode, dealername FROM dealer WHERE dealername = $1`;
      let result = await this.pgPoolI.Query(query, [dealername.toUpperCase()]);
      return result.rows[0];
    } catch (error) {
      this.logger.error("getDealerByName error: ", error);
      throw error;
    }
  }

  async getCityByName(cityname) {
    try {
      let query = `SELECT citycode, cityname FROM city WHERE cityname = $1`;
      let result = await this.pgPoolI.Query(query, [cityname.toUpperCase()]);
      return result.rows[0];
    } catch (error) {
      this.logger.error("getCityByName error: ", error);
      throw error;
    }
  }

  async getColorByName(colorname) {
    try {
      let query = `SELECT colorcode, colorname FROM color WHERE colorname = $1`;
      let result = await this.pgPoolI.Query(query, [colorname.toUpperCase()]);
      return result.rows[0];
    } catch (error) {
      this.logger.error("getColorByName error: ", error);
      throw error;
    }
  }
}
