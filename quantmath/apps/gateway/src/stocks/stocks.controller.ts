// quantmath/apps/gateway/src/stocks/stocks.controller.ts
import { Controller, Get, HttpException, HttpStatus, Post } from '@nestjs/common';
import { StocksService } from './stocks.service';
import { StockDto } from './dto/stock.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('stocks')
@Controller('stocks')
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  @Get()
  @ApiOperation({ summary: 'Retrieve live stock prices' })
  @ApiResponse({ status: 200, description: 'List of stocks returned successfully.' })
  async findAll(): Promise<StockDto[]> {
    const stocks = await this.stocksService.findAll();
    if (!stocks.length) {
      throw new HttpException('Failed to fetch stock data', HttpStatus.NOT_FOUND);
    }
    return stocks;
  }

  @Get('cached')
  @ApiOperation({ summary: 'Retrieve cached stock prices including AI predictions' })
  @ApiResponse({ status: 200, description: 'Cached stocks returned successfully.' })
  async getCached(): Promise<StockDto[]> {
    const stocks = await this.stocksService.findAll();
    if (!stocks.length) {
      throw new HttpException('No cached stocks found', HttpStatus.NOT_FOUND);
    }
    return stocks;
  }

  @Post('run-ai')
  @ApiOperation({ summary: 'Manually run AI predictions for stocks' })
  @ApiResponse({ status: 200, description: 'AI predictions updated successfully.' })
  async runAI(): Promise<(StockDto & { prediction?: number })[]> {
    try {
      return await this.stocksService.runAIPredictions();
    } catch (err: any) {
      throw new HttpException(`AI prediction failed: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
