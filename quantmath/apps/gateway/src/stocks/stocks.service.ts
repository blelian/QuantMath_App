import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { StockDto } from './dto/stock.dto';

@Injectable()
export class StocksService {
  private readonly apiKey = process.env.TWELVEDATA_KEY;

  // Default symbols
  private readonly defaultSymbols = ['AAPL', 'GOOG', 'MSFT', 'TSLA'];

  // Cache to reduce requests
  private lastResults: StockDto[] = [];
  private lastFetchTime = 0;
  private cacheDuration = 60 * 1000; // 1 minute

  async findAll(symbols?: string[]): Promise<StockDto[]> {
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
    const fetchSymbols = symbols && symbols.length ? symbols : this.defaultSymbols;

    for (const symbol of fetchSymbols) {
      try {
        // Using 'quote' endpoint to get price and timestamp
        const url = `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${this.apiKey}`;
        const response = await axios.get(url);

        console.log(`Twelve Data response for ${symbol}:`, response.data);

        const quote = response.data;
        if (quote && quote.price) {
          results.push({
            symbol,
            price: parseFloat(quote.price),
            updatedAt: quote.timestamp ? new Date(parseInt(quote.timestamp) * 1000) : new Date(),
          });
        } else if (quote.message) {
          console.warn(`API error for ${symbol}: ${quote.message}`);
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

    if (this.lastResults.length) return this.lastResults;

    throw new HttpException(
      'Failed to fetch stock data from Twelve Data',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
