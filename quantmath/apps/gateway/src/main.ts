import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as dotenv from 'dotenv';
import { runModule } from './module'; // <-- import your assignment module

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend(s) and allow credentials
  const allowedOrigins = [
    'https://quant-math-app.vercel.app', // your deployed frontend
    'http://localhost:3000',             // local frontend dev
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  console.log(`CORS enabled for: ${allowedOrigins.join(', ')}`);

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

  // Run the assignment module
  await runModule(); // <-- this will print to the terminal

  // Start server
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
  await app.listen(port);
  console.log(`🚀 QuantMath API running at http://localhost:${port}`);
}

bootstrap();
