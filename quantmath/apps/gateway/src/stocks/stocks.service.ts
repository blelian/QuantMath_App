import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

export interface StockDto {
  symbol: string;
  price: number;
  updatedAt: Date;
}

@Injectable()
export class StocksService {
  private readonly apiKey = process.env.ALPHA_VANTAGE_KEY;

  // List of stock symbols to fetch
  private readonly symbols = ['AAPL', 'GOOG', 'MSFT', 'TSLA'];

  async findAll(): Promise<StockDto[]> {
    if (!this.apiKey) {
      throw new HttpException(
        'Alpha Vantage API key not set',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const results: StockDto[] = [];

    for (const symbol of this.symbols) {
      try {
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`;
        const response = await axios.get(url);

        const data = response.data['Global Quote'];
        if (data) {
          results.push({
            symbol: data['01. symbol'],
            price: parseFloat(data['05. price']),
            updatedAt: new Date(data['07. latest trading day']),
          });
        }
      } catch (err) {
        console.error(`Failed to fetch data for ${symbol}`, err);
      }
    }

    return results;
  }
}
