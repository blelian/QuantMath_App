import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('QuantMath API')
    .setDescription('Backend API for QuantMath (NestJS + Render + Neon)')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Start server
  await app.listen(process.env.PORT ?? 3001);
  console.log(`🚀 QuantMath API running at http://localhost:${process.env.PORT ?? 3001}`);
}
bootstrap();
