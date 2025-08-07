import z from "zod";
import {
  APIResponseBadRequest,
  APIResponseInternalErr,
  APIResponseOK,
} from "../../../utils/responseutil.js";
import { validateAllInputs } from "../../../utils/validationutil.js";
import PackageHdlrImpl from "./packagehdlr_impl.js";
export default class PackageHdlr {
  constructor(packageSvcI, logger) {
    this.packageSvcI = packageSvcI;
    this.logger = logger;
    this.packageHdlrImpl = new PackageHdlrImpl(this.packageSvcI, logger);
  }

  RegisterRoutes(router) {
    router.post("/type", this.CreatePackageType);
    router.get("/types", this.GetPackageTypes);
    router.post("/", this.CreatePackage);
    router.put("/:pkgid", this.UpdatePackage);
    router.get("/list", this.ListPackages);
    router.get("/:pkgid", this.GetPkgInfo);
    router.put("/:pkgid/modules", this.UpdatePkgModules);
    router.delete("/:pkgid", this.DeletePackage);
  }

  CreatePackageType = async (req, res, next) => {
    try {
      const createdby = req.userid;

      const schema = z.object({
        pkgtype: z.enum(["standard", "custom"], {
          message: "Package type must be either 'standard' or 'custom'",
        }),
      });

      const { pkgtype } = validateAllInputs(schema, {
        pkgtype: req.body.pkgtype,
      });

      const result = await this.packageHdlrImpl.CreatePackageTypeLogic(
        pkgtype,
        createdby
      );

      APIResponseOK(req, res, result, "Package type created successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "CREATE_PACKAGE_TYPE_ERR",
          e.toString(),
          "Create package type failed"
        );
      }
    }
  };

  GetPackageTypes = async (req, res, next) => {
    try {
      let result = await this.packageHdlrImpl.GetPackageTypesLogic();
      APIResponseOK(req, res, result, "Package types fetched successfully");
    } catch (e) {
      APIResponseInternalErr(
        req,
        res,
        "GET_PACKAGE_TYPES_ERR",
        e.toString(),
        "Get package types failed"
      );
    }
  };

  CreatePackage = async (req, res, next) => {
    try {
      const createdby = req.userid;

      const schema = z.object({
        pkgname: z
          .string({ message: "Package Name must be a string" })
          .nonempty({ message: "Package Name cannot be empty" })
          .max(128, { message: "Package Name must be at most 128 characters" })
          .regex(/^[A-Za-z0-9 _-]+$/, {
            message:
              "Package Name can only contain letters, numbers, spaces, hyphens, and underscores",
          }),
        pkgtype: z.enum(["standard", "custom"], {
          message: "Package type must be either 'standard' or 'custom'",
        }),

        pkginfo: z
          .record(z.any(), { message: "Package info must be an object" })
          .optional(),

        isenabled: z
          .boolean({ message: "isenabled must be a boolean" })
          .optional(),
      });

      const { pkgname, pkgtype, pkginfo, isenabled } = validateAllInputs(
        schema,
        {
          pkgname: req.body.pkgname,
          pkgtype: req.body.pkgtype,
          pkginfo: req.body.pkginfo,
          isenabled: req.body.isenabled,
        }
      );

      const result = await this.packageHdlrImpl.CreatePkgLogic(
        pkgname,
        pkgtype,
        pkginfo || {},
        isenabled !== undefined ? isenabled : true,
        createdby
      );

      APIResponseOK(req, res, result, "Package created successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "CREATE_PACKAGE_ERR",
          e.toString(),
          "Create package failed"
        );
      }
    }
  };

  ListPackages = async (req, res, next) => {
    try {
      let result = await this.packageHdlrImpl.ListPackagesLogic();
      APIResponseOK(req, res, result, "Packages fetched successfully");
    } catch (e) {
      APIResponseInternalErr(
        req,
        res,
        "LIST_PACKAGES_ERR",
        e.toString(),
        "List packages failed"
      );
    }
  };

  UpdatePackage = async (req, res, next) => {
    try {
      const updatedby = req.userid;
      let pkgid = req.params.pkgid;
      let schema = z.object({
        updatedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),

        pkgid: z
          .string({ message: "Invalid Package ID format" })
          .nonempty({ message: "Package ID cannot be empty" })
          .max(128, { message: "Package ID must not exceed 128 characters" }),
      });
      validateAllInputs(schema, {
        updatedby,
        pkgid,
      });
      let { pkgid: bodypkgid, ...updateFields } = req.body;
      let result = await this.packageHdlrImpl.UpdatePackageLogic(
        pkgid,
        updateFields,
        updatedby
      );
      APIResponseOK(req, res, result, "Package updated successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "UPDATE_PACKAGE_ERR",
          e.toString(),
          "Update package failed"
        );
      }
    }
  };

  GetPkgInfo = async (req, res, next) => {
    try {
      let schema = z.object({
        pkgid: z
          .string({ message: "Invalid Package ID format" })
          .nonempty({ message: "Package ID cannot be empty" })
          .max(128, {
            message: "Package ID must be at most 128 characters long",
          }),
      });
      let { pkgid } = validateAllInputs(schema, {
        pkgid: req.params.pkgid,
      });
      let result = await this.packageHdlrImpl.GetPkgInfoLogic(pkgid);
      APIResponseOK(req, res, result, "Package info fetched successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "GET_PKG_INFO_ERR",
          e.toString(),
          "Get package info failed"
        );
      }
    }
  };

  UpdatePkgModules = async (req, res, next) => {
    try {
      const updatedby = req.userid;
      let pkgid = req.params.pkgid;
      let schema = z.object({
        updatedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),

        pkgid: z
          .string({ message: "Invalid Package ID format" })
          .nonempty({ message: "Package ID cannot be empty" })
          .max(128, { message: "Package ID must not exceed 128 characters" }),

        selectedmodules: z
          .array(z.string().nonempty({ message: "Module ID cannot be empty" }))
          .optional(),

        deselectedmodules: z
          .array(z.string().nonempty({ message: "Module ID cannot be empty" }))
          .optional(),
      });

      let { selectedmodules = [], deselectedmodules = [] } = validateAllInputs(
        schema,
        {
          updatedby,
          pkgid,
          selectedmodules: req.body.selectedmodules,
          deselectedmodules: req.body.deselectedmodules,
        }
      );

      let result = await this.packageHdlrImpl.UpdatePkgModulesLogic(
        pkgid,
        selectedmodules,
        deselectedmodules,
        updatedby
      );
      APIResponseOK(req, res, result, "Package modules updated successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        APIResponseInternalErr(
          req,
          res,
          "UPDATE_PKG_MODULES_ERR",
          e.toString(),
          "Update package modules failed"
        );
      }
    }
  };

  DeletePackage = async (req, res, next) => {
    try {
      const schema = z.object({
        pkgid: z
          .string({ message: "Invalid Package ID format" })
          .uuid({ message: "Package ID must be a valid UUID" }),

        deletedby: z
          .string({ message: "Invalid User ID format" })
          .uuid({ message: "User ID must be a valid UUID" }),
      });

      const { pkgid, deletedby } = validateAllInputs(schema, {
        pkgid: req.params.pkgid,
        deletedby: req.userid,
      });

      let result = await this.packageHdlrImpl.DeletePackageLogic(
        pkgid,
        deletedby
      );

      APIResponseOK(req, res, result, "Package deleted successfully");
    } catch (e) {
      if (e.errcode === "INPUT_ERROR") {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else if (
        e.errcode === "PACKAGE_IN_USE" ||
        e.errcode === "PACKAGE_HAS_MODULES" ||
        e.errcode === "PACKAGE_HAS_HISTORY"
      ) {
        return APIResponseBadRequest(req, res, e.errcode, e.errdata, e.message);
      } else {
        return APIResponseInternalErr(
          req,
          res,
          "DELETE_PACKAGE_ERR",
          e.toString(),
          "Delete package failed"
        );
      }
    }
  };
}
