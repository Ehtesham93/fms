import z from "zod";
import {
  ValidateModuleCode,
  ValidatePermissionId,
} from "../../../utils/commonutil.js";
import {
  APIResponseBadRequest,
  APIResponseInternalErr,
  APIResponseOK,
} from "../../../utils/responseutil.js";
import { validateAllInputs } from "../../../utils/validationutil.js";
import ModuleHdlrImpl from "./modulehdlr_impl.js";
export default class ModuleHdlr {
  constructor(moduleSvcI, userSvcI, logger) {
    this.moduleSvcI = moduleSvcI;
    this.userSvcI = userSvcI;
    this.logger = logger;
    this.moduleHdlrImpl = new ModuleHdlrImpl(moduleSvcI, userSvcI, logger);
  }

  RegisterRoutes(router) {
    router.post("/", this.CreateModule);
    router.get("/types", this.GetModuleTypes);
    router.get("/list", this.ListModules);
    router.get("/:moduleid", this.GetModule);
    router.put("/:moduleid", this.UpdateModule);
    router.post("/:moduleid/perm", this.AddModulePerm);
    router.post("/:moduleid/perms", this.AddModulePerms);
    router.put("/:moduleid/perm/:permid", this.UpdateModulePerm);
    router.delete("/:moduleid/perm/:permid", this.DeleteModulePerm);
    router.delete("/:moduleid", this.DeleteModule);
  }

  GetModuleTypes = async (req, res, next) => {
    try {
      let result = await this.moduleHdlrImpl.GetModuleTypesLogic();
      APIResponseOK(req, res, result, "Module types fetched successfully");
    } catch (e) {
      APIResponseInternalErr(
        req,
        res,
        "GET_MODULE_TYPES_ERR",
        e.toString(),
        "Get module types failed"
      );
    }
  };

  CreateModule = async (req, res, next) => {
    try {
      let schema = z.object({
        modulename: z
          .string({ message: "Invalid module name format" })
          .nonempty({ message: "Module name cannot be empty" })
          .max(128, { message: "Module name must be at most 128 characters" })
          .regex(/^[A-Za-z0-9 _-]+$/, {
            message:
              "Module name can only contain letters, numbers, spaces, hyphens, and underscores",
          }),
        moduletype: z
          .string({ message: "Invalid module type format" })
          .nonempty({ message: "Module type cannot be empty" })
          .max(128, { message: "Module type must not exceed 128 characters" }),
        modulecode: z
          .string({ message: "Invalid module code format" })
          .nonempty({ message: "Module code cannot be empty" })
          .max(128, { message: "Module code must not exceed 128 characters" }),
        creditspervehicleday: z
          .number({ message: "creditspervehicleday must be a number" })
          .min(0, { message: "creditspervehicleday must be non-negative" })
          .optional()
          .default(0),
      });
      let { modulename, moduletype, modulecode, creditspervehicleday } =
        validateAllInputs(schema, {
          modulename: req.body.modulename,
          moduletype: req.body.moduletype,
          modulecode: req.body.modulecode,
          creditspervehicleday: req.body.creditspervehicleday,
        });

      if (!ValidateModuleCode(modulecode)) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_MODULE_CODE",
          "Invalid module code"
        );
        return;
      }
      let createdby = req.userid;
      let result = await this.moduleHdlrImpl.CreateModuleLogic(
        modulename,
        moduletype,
        modulecode,
        creditspervehicleday,
        createdby
      );
      APIResponseOK(req, res, result, "Module created successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "CREATE_MODULE_ERR",
          e.toString(),
          "Create module failed"
        );
      }
    }
  };

  ListModules = async (req, res, next) => {
    try {
      let result = await this.moduleHdlrImpl.ListModulesLogic();
      APIResponseOK(req, res, result, "Modules fetched successfully");
    } catch (e) {
      APIResponseInternalErr(
        req,
        res,
        "LIST_MODULES_ERR",
        e.toString(),
        "List modules failed"
      );
    }
  };

  GetModule = async (req, res, next) => {
    try {
      let schema = z.object({
        moduleid: z
          .string({ message: "Module ID is required" })
          .nonempty({ message: "Module ID cannot be empty" })
          .max(128, { message: "Module ID must not exceed 128 characters" }),
      });

      let { moduleid } = validateAllInputs(schema, {
        moduleid: req.params.moduleid,
      });

      let result = await this.moduleHdlrImpl.GetModuleLogic(moduleid);
      APIResponseOK(req, res, result, "Module fetched successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_MODULE_ERR",
          e.toString(),
          "Get module failed"
        );
      }
    }
  };

  UpdateModule = async (req, res, next) => {
    try {
      const schema = z.object({
        moduleid: z
          .string({ message: "Invalid Module ID format" })
          .uuid({ message: "Module ID must be a valid UUID" }),

        modulename: z
          .string({ message: "Invalid Module Name format" })
          .nonempty({ message: "Module Name cannot be empty" })
          .max(128, { message: "Module Name must be at most 128 characters" })
          .regex(/^[A-Za-z0-9 _-]+$/, {
            message:
              "Module Name can only contain letters, numbers, spaces, hyphens, and underscores",
          })
          .optional(),

        moduletype: z
          .string({ message: "Invalid module type format" })
          .nonempty({ message: "Module type cannot be empty" })
          .max(128, { message: "Module type must not exceed 128 characters" })
          .optional(),

        creditspervehicleday: z
          .preprocess((val) => Number(val), z.number().min(0))
          .optional()
          .default(0),

        moduleinfo: z
          .record(z.any(), { message: "moduleinfo must be an object" })
          .optional()
          .default({}),

        isenabled: z
          .preprocess((val) => val === "true" || val === true, z.boolean())
          .optional()
          .default(false),

        priority: z
          .number({ message: "priority must be a number" })
          .min(0, { message: "priority must be non-negative" })
          .optional(),

        updatedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),
      });

      const validatedData = validateAllInputs(schema, {
        moduleid: req.params.moduleid,
        ...req.body,
        updatedby: req.userid,
      });

      const updateFields = {};
      const allowedFields = [
        "modulename",
        "moduletype",
        "creditspervehicleday",
        "moduleinfo",
        "isenabled",
        "priority",
      ];

      for (const field of allowedFields) {
        if (req.body.hasOwnProperty(field)) {
          updateFields[field] = validatedData[field];
        }
      }

      if (Object.keys(updateFields).length === 0) {
        return APIResponseBadRequest(
          req,
          res,
          "NO_UPDATE_FIELDS",
          "No valid fields provided for update"
        );
      }

      let result = await this.moduleHdlrImpl.UpdateModuleLogic(
        validatedData.moduleid,
        updateFields,
        validatedData.updatedby
      );

      APIResponseOK(req, res, result, "Module updated successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "UPDATE_MODULE_ERR",
          e.toString(),
          "Update module failed"
        );
      }
    }
  };

  AddModulePerm = async (req, res, next) => {
    try {
      let createdby = req.userid;

      const schema = z.object({
        moduleid: z
          .string({ message: "Invalid Module ID format" })
          .nonempty({ message: "Module ID cannot be empty" })
          .max(128, { message: "Module ID must not exceed 128 characters" }),

        permid: z
          .string({ message: "Invalid Permission ID format" })
          .nonempty({ message: "Permission ID cannot be empty" })
          .max(128, {
            message: "Permission ID must not exceed 128 characters",
          }),

        isenabled: z.boolean().optional(),
        moduleperminfo: z.record(z.any()).optional(),

        createdby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),
      });

      const { moduleid, permid, isenabled, moduleperminfo } = validateAllInputs(
        schema,
        {
          moduleid: req.params.moduleid,
          permid: req.body.permid,
          isenabled: req.body.isenabled,
          moduleperminfo: req.body.moduleperminfo,
          createdby,
        }
      );

      const result = await this.moduleHdlrImpl.AddModulePermLogic(
        moduleid,
        permid,
        !!isenabled,
        moduleperminfo,
        createdby
      );

      APIResponseOK(req, res, result, "Module permission added successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "ADD_MODULE_PERM_ERR",
          e.toString(),
          "Add module permission failed"
        );
      }
    }
  };

  AddModulePerms = async (req, res, next) => {
    try {
      let createdby = req.userid;

      const schema = z.object({
        moduleid: z
          .string({ message: "Invalid Module ID format" })
          .nonempty({ message: "Module ID cannot be empty" })
          .max(128, { message: "Module ID must not exceed 128 characters" }),

        permids: z
          .array(
            z
              .string({ message: "Each Permission ID must be a string" })
              .nonempty({ message: "Permission ID cannot be empty" })
              .max(128, {
                message: "Permission ID must not exceed 128 characters",
              })
          )
          .min(1, { message: "At least one permission ID is required" }),

        createdby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),
      });

      const { moduleid, permids } = validateAllInputs(schema, {
        moduleid: req.params.moduleid,
        permids: req.body.permids,
        createdby,
      });

      const result = await this.moduleHdlrImpl.AddModulePermsLogic(
        moduleid,
        permids,
        createdby
      );

      APIResponseOK(req, res, result, "Module permissions added successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "ADD_MODULE_PERMS_ERR",
          e.toString(),
          "Add module permissions failed"
        );
      }
    }
  };

  UpdateModulePerm = async (req, res, next) => {
    try {
      let updatedby = req.userid;
      let moduleid = req.params.moduleid;
      let permid = req.params.permid;
      let schema = z.object({
        updatedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),
        moduleid: z
          .string({ message: "Invalid Module ID format" })
          .nonempty({ message: "Module ID cannot be empty" })
          .max(128, { message: "Module ID must not exceed 128 characters" }),
        permid: z
          .string({ message: "Invalid Permission ID format" })
          .nonempty({ message: "Permission ID cannot be empty" })
          .max(128, {
            message: "Permission ID must not exceed 128 characters",
          }),
      });

      validateAllInputs(schema, {
        updatedby,
        moduleid,
        permid,
      });

      if (!ValidatePermissionId(permid)) {
        APIResponseBadRequest(
          req,
          res,
          "INVALID_PERMISSION_ID",
          "Invalid permission id"
        );
        return;
      }
      let {
        moduleid: bodyModuleId,
        permid: bodyPermId,
        ...updateFields
      } = req.body;
      let result = await this.moduleHdlrImpl.UpdateModulePermLogic(
        moduleid,
        permid,
        updateFields,
        updatedby
      );

      APIResponseOK(req, res, result, "Module permission updated successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "UPDATE_MODULE_PERM_ERR",
          e.toString(),
          "Update module permission failed"
        );
      }
    }
  };

  DeleteModulePerm = async (req, res, next) => {
    try {
      let updatedby = req.userid;

      const schema = z.object({
        moduleid: z
          .string({ message: "Module ID is required" })
          .nonempty({ message: "Module ID cannot be empty" })
          .max(128, { message: "Module ID must not exceed 128 characters" }),

        permid: z
          .string({ message: "Permission ID is required" })
          .nonempty({ message: "Permission ID cannot be empty" })
          .max(128, {
            message: "Permission ID must not exceed 128 characters",
          }),

        updatedby: z
          .string({ message: "User ID is required" })
          .uuid({ message: "User ID must be a valid UUID" }),
      });

      const { moduleid, permid } = validateAllInputs(schema, {
        moduleid: req.params.moduleid,
        permid: req.params.permid,
        updatedby,
      });

      let result = await this.moduleHdlrImpl.DeleteModulePermLogic(
        moduleid,
        permid,
        updatedby
      );

      APIResponseOK(req, res, result, "Module permission deleted successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "DELETE_MODULE_PERM_ERR",
          e.toString(),
          "Delete module permission failed"
        );
      }
    }
  };

  DeleteModule = async (req, res, next) => {
    try {
      const schema = z.object({
        moduleid: z
          .string({ message: "Invalid Module ID format" })
          .uuid({ message: "Module ID must be a valid UUID" }),

        deletedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),
      });

      const { moduleid, deletedby } = validateAllInputs(schema, {
        moduleid: req.params.moduleid,
        deletedby: req.userid,
      });

      let result = await this.moduleHdlrImpl.DeleteModuleLogic(
        moduleid,
        deletedby
      );

      APIResponseOK(req, res, result, "Module deleted successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "DELETE_MODULE_ERR",
          e.toString(),
          "Delete module failed"
        );
      }
    }
  };
}
