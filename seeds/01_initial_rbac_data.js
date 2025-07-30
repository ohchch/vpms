/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries in reverse order of foreign key dependencies
  await knex('role_permissions').del();
  await knex('user_roles').del();
  await knex('roles').del();
  await knex('permissions').del();

  // Insert roles
  const [adminRoleId] = await knex('roles').insert({ name: 'Admin', description: 'Administrator role with full access' });
  const [operatorRoleId] = await knex('roles').insert({ name: 'Operator', description: 'Operator role with data viewing and export access' });

  // Insert permissions
  const permissionsToInsert = [
    { name: 'data:read', description: 'Permission to read data' },
    { name: 'data:export', description: 'Permission to export data' },
    { name: 'dashboard:view', description: 'Permission to view dashboard' },
    { name: 'charts:view', description: 'Permission to view charts' },
    { name: 'settings:read', description: 'Permission to read settings' },
    { name: 'settings:update', description: 'Permission to update settings' },
    { name: 'notification:test', description: 'Permission to test notifications' }
  ];
  await knex('permissions').insert(permissionsToInsert);

  // Retrieve all permission IDs
  const allPermissions = await knex('permissions').select('id', 'name');
  const permissionMap = new Map(allPermissions.map(p => [p.name, p.id]));

  // Grant all permissions to Admin role
  const adminRolePermissions = allPermissions.map(p => ({
    role_id: adminRoleId,
    permission_id: p.id
  }));
  await knex('role_permissions').insert(adminRolePermissions);

  // Grant specific permissions to Operator role
  const operatorPermissions = [
    'data:read',
    'data:export',
    'dashboard:view',
    'charts:view'
  ];

  const operatorRolePermissions = operatorPermissions
    .filter(pName => permissionMap.has(pName)) // Ensure permission exists
    .map(pName => ({
      role_id: operatorRoleId,
      permission_id: permissionMap.get(pName)
    }));
  await knex('role_permissions').insert(operatorRolePermissions);

  console.log('RBAC initial data seeded successfully!');
};
