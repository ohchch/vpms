/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('users', function (table) {
      table.increments('id').primary();
      table.string('username', 255).notNullable().unique();
      table.string('password_hash', 255).notNullable();
      table.string('email', 255).notNullable().unique();
      table.timestamps(true, true); // Adds created_at and updated_at columns
    })
    .createTable('roles', function (table) {
      table.increments('id').primary();
      table.string('name', 50).notNullable().unique();
      table.string('description', 255);
    })
    .createTable('permissions', function (table) {
      table.increments('id').primary();
      table.string('name', 100).notNullable().unique();
      table.string('description', 255);
    })
    .createTable('user_roles', function (table) {
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('role_id').unsigned().references('id').inTable('roles').onDelete('CASCADE');
      table.primary(['user_id', 'role_id']); // Composite primary key
    })
    .createTable('role_permissions', function (table) {
      table.integer('role_id').unsigned().references('id').inTable('roles').onDelete('CASCADE');
      table.integer('permission_id').unsigned().references('id').inTable('permissions').onDelete('CASCADE');
      table.primary(['role_id', 'permission_id']); // Composite primary key
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('role_permissions')
    .dropTableIfExists('user_roles')
    .dropTableIfExists('permissions')
    .dropTableIfExists('roles')
    .dropTableIfExists('users');
};
