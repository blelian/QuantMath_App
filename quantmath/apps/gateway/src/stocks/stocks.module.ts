import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StocksService } from './stocks.service';
import { StockEntity } from './stock.entity';
import { StocksController } from './stocks.controller';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockEntity]), // <-- this makes the repository injectable
    ScheduleModule.forRoot(), // if you want cron jobs
  ],
  providers: [StocksService],
  controllers: [StocksController],
  exports: [StocksService],
})
export class StocksModule {}
