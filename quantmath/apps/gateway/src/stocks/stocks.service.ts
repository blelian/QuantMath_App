import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { StockDto } from './dto/stock.dto';

@Injectable()
export class StocksService {
  private readonly apiKey = process.env.TWELVEDATA_KEY;
  private readonly symbols = ['AAPL', 'GOOG', 'MSFT', 'TSLA'];

  private lastResults: StockDto[] = [];
  private lastFetchTime = 0;
  private cacheDuration = 60 * 1000; // 1 minute
  private maxRetries = 3;

  async findAll(): Promise<StockDto[]> {
    if (!this.apiKey) {
      throw new HttpException(
        'Twelve Data API key not set',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const now = Date.now();
    if (this.lastResults.length && now - this.lastFetchTime < this.cacheDuration) {
      console.log('Returning cached stock data');
      return this.lastResults;
    }

    const results: StockDto[] = [];

    for (const symbol of this.symbols) {
      let success = false;
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${this.apiKey}`;
          const response = await axios.get(url);

          const price = parseFloat(response.data.price);
          if (!isNaN(price)) {
            results.push({
              symbol,
              price,
              updatedAt: new Date(),
            });
            success = true;
            break; // exit retry loop
          } else {
            console.warn(`No valid price for ${symbol} (attempt ${attempt})`);
          }
        } catch (err: any) {
          console.error(`Failed to fetch ${symbol} (attempt ${attempt}):`, err.message);
          await new Promise(res => setTimeout(res, 500)); // wait 0.5s before retry
        }
      }

      if (!success) {
        console.warn(`Using cached data for ${symbol} if available`);
        const cached = this.lastResults.find(r => r.symbol === symbol);
        if (cached) results.push(cached);
      }
    }

    if (results.length) {
      this.lastResults = results;
      this.lastFetchTime = Date.now();
      return results;
    }

    // If no results and no cache
    if (this.lastResults.length) {
      console.log('Returning previous cached data due to API failure');
      return this.lastResults;
    }

    throw new HttpException(
      'Failed to fetch stock data from Twelve Data after retries',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
