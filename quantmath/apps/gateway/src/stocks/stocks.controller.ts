import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { StocksService } from './stocks.service';
import { StockDto } from './dto/stock.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('stocks')
@Controller('stocks')
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  @Get()
  @ApiOperation({ summary: 'Retrieve live stock prices' })
  @ApiResponse({
    status: 200,
    description: 'List of stocks returned successfully.',
    schema: {
      type: 'array',
      items: {
        $ref: '#/components/schemas/StockDto',
      },
      example: [
        { symbol: 'AAPL', price: 271.39999, updatedAt: '2025-10-31T09:59:04.391Z' },
        { symbol: 'GOOG', price: 281.89999, updatedAt: '2025-10-31T09:59:04.753Z' },
        { symbol: 'MSFT', price: 525.76001, updatedAt: '2025-10-31T09:59:05.128Z' },
        { symbol: 'TSLA', price: 440.10001, updatedAt: '2025-10-31T09:59:05.473Z' },
      ],
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded. Please try again later.',
  })
  async findAll(): Promise<StockDto[]> {
    const stocks = await this.stocksService.findAll();

    if (!stocks.length) {
      throw new HttpException(
        'Failed to fetch stock data or rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return stocks;
  }
}
