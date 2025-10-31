import { Controller, Get } from '@nestjs/common';
import { StocksService, StockDto } from './stocks.service';
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
    type: [Object], // You can also create a Swagger StockDto class for better docs
  })
  findAll(): Promise<StockDto[]> {
    return this.stocksService.findAll();
  }
}
