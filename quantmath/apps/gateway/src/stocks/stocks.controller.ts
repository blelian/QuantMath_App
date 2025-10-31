import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { StocksService } from './stocks.service';
import { Stock } from './stock.entity';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('stocks')
@Controller('stocks')
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  @Get()
  @ApiOperation({ summary: 'Retrieve all stocks' })
  @ApiResponse({ status: 200, description: 'List of stocks returned successfully.' })
  findAll(): Promise<Stock[]> {
    return this.stocksService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single stock by ID' })
  @ApiResponse({ status: 200, description: 'Stock returned successfully.' })
  findOne(@Param('id') id: number): Promise<Stock> {
    return this.stocksService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new stock' })
  @ApiResponse({ status: 201, description: 'Stock created successfully.' })
  create(@Body() stockData: Partial<Stock>) {
    return this.stocksService.create(stockData);
  }
}
