import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

export async function connectDb(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  logger.info({ uri: env.MONGO_URI }, 'Connected to MongoDB');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  logger.info('Disconnected from MongoDB');
}
