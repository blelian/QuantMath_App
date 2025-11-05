// quantmath/apps/gateway/src/stocks/stocks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { StockEntity } from './stock.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StockDto } from './dto/stock.dto';

@Injectable()
export class StocksService {
  private readonly apiKey = process.env.TWELVEDATA_KEY;
  private readonly symbols = ['AAPL', 'GOOG', 'MSFT', 'TSLA'];
  private readonly maxRetries = 3;
  private readonly logger = new Logger(StocksService.name);

  private predictions: Record<string, number> = {}; // In-memory cache

  constructor(
    @InjectRepository(StockEntity)
    private readonly stockRepo: Repository<StockEntity>,
  ) {}

  /**
   * Fetch all stocks with AI predictions
   */
  async findAll(): Promise<(StockDto & { prediction?: number })[]> {
    const stocks = await this.stockRepo.find();
    return stocks.map((s) => ({
      symbol: s.symbol,
      price: s.price,
      updatedAt: s.updatedAt,
      prediction: this.predictions[s.symbol],
    }));
  }

  /**
   * Cron job: every 5 min update stock prices and AI predictions
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async updateStocksFromAPI() {
    await this.fetchStockPrices();
    await this.updatePredictions();
  }

  /**
   * Fetch stock prices from Twelve Data API
   */
  private async fetchStockPrices() {
    if (!this.apiKey) {
      this.logger.warn('Twelve Data API key not set. Skipping update.');
      return;
    }

    for (const symbol of this.symbols) {
      let success = false;
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${this.apiKey}`;
          const response = await axios.get(url);
          const price = parseFloat(response.data.price);

          if (!isNaN(price)) {
            let stock = await this.stockRepo.findOne({ where: { symbol } });
            if (!stock) {
              stock = this.stockRepo.create({ symbol, price, updatedAt: new Date() });
            } else {
              stock.price = price;
              stock.updatedAt = new Date();
            }

            await this.stockRepo.save(stock);
            success = true;
            this.logger.log(`Updated ${symbol} price to ${price}`);
            break;
          }
        } catch (err: any) {
          this.logger.warn(`Failed to fetch ${symbol} (attempt ${attempt}): ${err.message}`);
          await new Promise((res) => setTimeout(res, 500)); // 0.5s delay
        }
      }

      if (!success) {
        this.logger.warn(`Failed to update ${symbol} after ${this.maxRetries} attempts`);
      }
    }
  }

  /**
   * Fetch AI predictions from FastAPI
   */
  async updatePredictions(): Promise<void> {
    try {
      const fastApiUrl =
        process.env.FASTAPI_URL || 'https://quantmath-app-1fastapi.onrender.com/predict';

      const stocks = await this.stockRepo.findByIds(this.symbols);

      const payload = stocks.map((s) => ({ symbol: s.symbol, price: s.price }));
      const response = await axios.post(fastApiUrl, payload);

      if (Array.isArray(response.data)) {
        this.predictions = response.data.reduce((acc, curr) => {
          acc[curr.symbol] = curr.predicted_price;
          return acc;
        }, {} as Record<string, number>);
        this.logger.log('✅ AI predictions updated successfully');
      } else {
        this.logger.warn('FastAPI returned unexpected response format');
      }
    } catch (err: any) {
      this.logger.warn(`Failed to fetch AI predictions: ${err.message}`);
    }
  }

  /**
   * Manually trigger AI predictions (for frontend "Run AI" button)
   */
  async runAIPredictions(): Promise<(StockDto & { prediction?: number })[]> {
    await this.fetchStockPrices(); // optional: refresh prices before prediction
    await this.updatePredictions();
    return this.findAll();
  }
}
