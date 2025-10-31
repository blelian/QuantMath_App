import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS specifically for your frontend
  const corsOrigin = process.env.CORS_ORIGIN ?? 'https://quantmath-frontend.vercel.app';
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });
  console.log(`CORS enabled for: ${corsOrigin}`);

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('QuantMath API')
    .setDescription('Backend API for QuantMath (NestJS + Render + Neon)')
    .setVersion('1.0')
    .addTag('stocks')
    .addTag('ai')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
  console.log('Swagger docs available at /api');

  // Check for Twelve Data API key
  if (!process.env.TWELVEDATA_KEY) {
    console.warn(
      '⚠ TWELVEDATA_KEY not set. Stock API calls will fail. Set it in Render environment variables.'
    );
  } else {
    console.log('Twelve Data API key found.');
  }

  // Start server
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
  await app.listen(port);
  console.log(`🚀 QuantMath API running at http://localhost:${port}`);
}

bootstrap();
