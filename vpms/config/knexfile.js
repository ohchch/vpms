// Load environment variables from the .env file in the same directory
require('dotenv').config();

module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    },
    migrations: {
      // FIX: Correct the path to be relative to this config file's location.
      // The path from /app/config to /app/db/migrations is ../db/migrations
      directory: '../db/migrations'
    },
    seeds: {
      // FIX: Correct the path for seeds as well.
      // The path from /app/config to /app/seeds will be ../seeds
      directory: '../seeds'
    }
  },

  production: {
    client: 'mysql2',
    connection: {
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: '../db/migrations'
    }
  }
};
