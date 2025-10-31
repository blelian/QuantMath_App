import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { StockDto } from './dto/stock.dto';

@Injectable()
export class StocksService {
  private readonly apiKey = process.env.ALPHA_VANTAGE_KEY;

  // Symbols to fetch
  private readonly symbols = ['AAPL', 'GOOG', 'MSFT', 'TSLA'];

  // Cache last successful fetch to avoid rate limits
  private lastResults: StockDto[] = [];
  private lastFetchTime: number = 0;
  private cacheDuration = 60 * 1000; // 1 minute

  async findAll(): Promise<StockDto[]> {
    if (!this.apiKey) {
      throw new HttpException(
        'Alpha Vantage API key not set',
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
      try {
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`;
        const response = await axios.get(url);

        console.log(`Alpha Vantage response for ${symbol}:`, response.data);

        const data = response.data['Global Quote'];
        if (data && data['01. symbol'] && data['05. price']) {
          results.push({
            symbol: data['01. symbol'],
            price: parseFloat(data['05. price']),
            updatedAt: new Date(data['07. latest trading day']),
          });
        } else if (response.data['Note']) {
          console.warn(`Rate limit hit: ${response.data['Note']}`);
        } else {
          console.warn(`No data found for symbol: ${symbol}`);
        }
      } catch (err: any) {
        console.error(`Failed to fetch data for ${symbol}:`, err.message);
      }
    }

    // Only update cache if we got results
    if (results.length) {
      this.lastResults = results;
      this.lastFetchTime = Date.now();
      return results;
    }

    // If API failed but we have previous data, return that
    if (this.lastResults.length) {
      console.log('Returning previous cached data due to API failure or rate limit');
      return this.lastResults;
    }

    // If no previous data, throw error
    throw new HttpException(
      'Failed to fetch stock data or rate limit exceeded',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
