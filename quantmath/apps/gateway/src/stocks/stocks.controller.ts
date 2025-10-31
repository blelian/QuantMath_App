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
    type: [StockDto],
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
