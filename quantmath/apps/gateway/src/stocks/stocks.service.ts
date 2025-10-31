import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { StockDto } from './dto/stock.dto';

@Injectable()
export class StocksService {
  private readonly apiKey = process.env.FCSAPI_KEY;
  private readonly symbols = ['AAPL', 'GOOG', 'MSFT', 'TSLA'];
  private lastResults: StockDto[] = [];
  private lastFetchTime = 0;
  private cacheDuration = 60 * 1000; // 1 minute

  async findAll(): Promise<StockDto[]> {
    if (!this.apiKey) {
      throw new HttpException('FCSAPI key not set', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const now = Date.now();
    if (this.lastResults.length && now - this.lastFetchTime < this.cacheDuration) {
      console.log('Returning cached stock data');
      return this.lastResults;
    }

    const results: StockDto[] = [];

    for (const symbol of this.symbols) {
      try {
        const url = `https://fcsapi.com/api-v3/stock/latest?symbol=${symbol}&access_key=${this.apiKey}`;
        const response = await axios.get(url);

        console.log(`FCSAPI response for ${symbol}:`, response.data);

        const stockData = response.data?.response?.[0];
        if (stockData && stockData.symbol && stockData.last) {
          results.push({
            symbol: stockData.symbol,
            price: parseFloat(stockData.last),
            updatedAt: new Date(stockData.date),
          });
        } else {
          console.warn(`No data for symbol: ${symbol}`);
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
      console.log('Returning previous cached data due to API failure');
      return this.lastResults;
    }

    throw new HttpException('Failed to fetch stock data from FCSAPI', HttpStatus.SERVICE_UNAVAILABLE);
  }
}
