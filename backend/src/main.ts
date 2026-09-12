import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Allowed origins — add any extra domains here if needed
  const allowedOrigins = [
    configService.get('FRONTEND_URL'),      // e.g. https://njugush-ent.vercel.app
    'http://localhost:5173',                 // local dev
    'http://localhost:4173',                 // local preview build
  ].filter(Boolean)                          // drop undefined/empty values

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, mobile apps, curl)
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      callback(new Error(`CORS: origin "${origin}" is not allowed`))
    },
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api');

  // Swagger API Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Njugush POS API')
    .setDescription('Njugush Enterprises POS & Inventory Management System API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get('PORT') || 3000;
  await app.listen(port);

  console.log(`========================================`);
  console.log(`  Njugush POS Backend v1.0.0`);
  console.log(`  Running on port ${port}`);
  console.log(`  Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`  API Docs: http://localhost:${port}/api/docs`);
  console.log(`========================================`);
}

bootstrap();
