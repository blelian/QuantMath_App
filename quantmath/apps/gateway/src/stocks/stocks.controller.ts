// stocks.controller.ts
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
      items: { $ref: '#/components/schemas/StockDto' },
    },
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

  // New cached route
  @Get('cached')
  @ApiOperation({ summary: 'Retrieve cached stock prices including AI predictions' })
  @ApiResponse({
    status: 200,
    description: 'Cached stocks returned successfully.',
    schema: {
      type: 'array',
      items: { $ref: '#/components/schemas/StockDto' },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'No cached stocks available',
  })
  async getCached(): Promise<StockDto[]> {
    const stocks = await this.stocksService.findAll();

    if (!stocks.length) {
      throw new HttpException('No cached stocks found', HttpStatus.NOT_FOUND);
    }

    return stocks;
  }
}
