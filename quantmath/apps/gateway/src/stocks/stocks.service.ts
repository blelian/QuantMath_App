import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { StockDto } from './dto/stock.dto';

@Injectable()
export class StocksService {
  private readonly apiKey = process.env.TWELVEDATA_KEY;

  private readonly symbols = ['AAPL', 'GOOG', 'MSFT', 'TSLA'];

  // Optional: cache to reduce requests
  private lastResults: StockDto[] = [];
  private lastFetchTime = 0;
  private cacheDuration = 60 * 1000; // 1 minute

  async findAll(): Promise<StockDto[]> {
    if (!this.apiKey) {
      throw new HttpException(
        'Twelve Data API key not set',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const now = Date.now();
    if (this.lastResults.length && now - this.lastFetchTime < this.cacheDuration) {
      return this.lastResults;
    }

    const results: StockDto[] = [];

    for (const symbol of this.symbols) {
      try {
        const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${this.apiKey}`;
        const response = await axios.get(url);

        console.log(`Twelve Data response for ${symbol}:`, response.data);

        const price = parseFloat(response.data.price);
        if (!isNaN(price)) {
          results.push({
            symbol,
            price,
            updatedAt: new Date(),
          });
        } else {
          console.warn(`No valid price for symbol: ${symbol}`);
        }
      } catch (err: any) {
        console.error(`Failed to fetch ${symbol}:`, err.message);
      }
    }

    if (results.length) {
      this.lastResults = results;
      this.lastFetchTime = Date.now();
      return results;
    }

    if (this.lastResults.length) {
      return this.lastResults;
    }

    throw new HttpException(
      'Failed to fetch stock data from Twelve Data',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
