import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

// Use require() here to avoid module resolution issues
const { StockEntity } = require('./stocks/stock.entity');

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [StockEntity],
  migrations: ['src/migrations/*.ts'], // or ['dist/migrations/*.js'] if compiled
  synchronize: false,
});
