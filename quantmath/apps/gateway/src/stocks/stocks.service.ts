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

  // Simple in-memory cache for AI predictions
  private predictions: Record<string, number> = {};

  constructor(
    @InjectRepository(StockEntity)
    private readonly stockRepo: Repository<StockEntity>,
  ) {}

  /** 
   * Fetch stock data for clients including AI predictions
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
   * Scheduled job: fetch stock prices from Twelve Data API every 5 minutes
   * and update AI predictions from FastAPI
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async updateStocksFromAPI() {
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
            let stock = await this.stockRepo.findOneBy({ symbol });

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
          } else {
            this.logger.warn(`Invalid price for ${symbol} (attempt ${attempt})`);
          }
        } catch (err: any) {
          this.logger.warn(`Failed to fetch ${symbol} (attempt ${attempt}): ${err.message}`);
          await new Promise((res) => setTimeout(res, 500)); // 0.5s delay before retry
        }
      }

      if (!success) {
        this.logger.warn(`Failed to update ${symbol} after ${this.maxRetries} attempts`);
      }
    }

    // After updating prices, fetch AI predictions from FastAPI
    await this.updatePredictions();
  }

  /**
   * Fetch AI predictions from FastAPI
   */
  private async updatePredictions() {
    try {
      const fastApiUrl = process.env.FASTAPI_URL || 'http://fastapi:8000/predict';
      const stocks = await this.stockRepo.findByIds(this.symbols);

      const payload = stocks.map((s) => ({ symbol: s.symbol, price: s.price }));

      const response = await axios.post(fastApiUrl, payload);

      if (Array.isArray(response.data)) {
        this.predictions = response.data.reduce((acc, curr) => {
          acc[curr.symbol] = curr.predicted_price;
          return acc;
        }, {} as Record<string, number>);
        this.logger.log('AI predictions updated successfully');
      } else {
        this.logger.warn('FastAPI returned unexpected response format');
      }
    } catch (err: any) {
      this.logger.warn(`Failed to fetch AI predictions: ${err.message}`);
    }
  }
}
