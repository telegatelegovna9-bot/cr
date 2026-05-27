import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    },
    logger: ['error', 'warn', 'log'],
  });

  // Security
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());

  // Rate limiting
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // API prefix
  app.setGlobalPrefix('api');

  // Swagger docs
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Crypto Screener API')
      .setDescription('Production-grade crypto screener platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  // Health check
  app.use('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now(), uptime: process.uptime() });
  });

  const port = parseInt(process.env.PORT || '3001', 10);
  await app.listen(port);
  console.log(`🚀 Crypto Screener API running on port ${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📚 Swagger docs: http://localhost:${port}/docs`);
  }
}

bootstrap();
