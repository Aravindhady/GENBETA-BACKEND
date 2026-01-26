import { createClient } from 'redis';

let redisClient;

// Initialize Redis client if REDIS_URL is provided
if (process.env.REDIS_URL) {
  redisClient = createClient({
    url: process.env.REDIS_URL
  });
  
  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });
  
  redisClient.connect().then(() => {
    console.log('Connected to Redis');
  }).catch((err) => {
    console.error('Failed to connect to Redis:', err);
  });
} else {
  // Create a mock client if Redis is not configured
  redisClient = {
    get: async () => null,
    set: async () => {},
    del: async () => {},
    quit: async () => {},
    on: () => {},
    connect: async () => {}
  };
  console.log('Redis not configured. Running without caching.');
}

export default redisClient;