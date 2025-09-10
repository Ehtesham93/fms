/**
 * Checks if user has the required console permission(s)
 * @param {string[]} userPermissions - Array of permissions assigned to the user (from req.userperms)
 * @param {string[]} requiredPermissions - Array of required permissions to check
 * @param {string} mode - 'any' or 'all' (default: 'any')
 * @returns {boolean} - true if user has required permissions, false otherwise
 */
export function CheckUserPerms(
  userPermissions,
  requiredPermissions,
  mode = "any"
) {
  if (!userPermissions || !Array.isArray(userPermissions)) {
    return false;
  }

  if (userPermissions.includes("all.all.all")) {
    return true;
  }

  if (
    !requiredPermissions ||
    !Array.isArray(requiredPermissions) ||
    requiredPermissions.length === 0
  ) {
    return false;
  }

  if (mode === "all") {
    return requiredPermissions.every((perm) => userPermissions.includes(perm));
  } else {
    return requiredPermissions.some((perm) => userPermissions.includes(perm));
  }
}
