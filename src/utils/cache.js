import redisClient from '../config/redis.js';

/**
 * Cache utility functions
 */

// Generate cache key
export const generateCacheKey = (prefix, params = {}) => {
  const paramString = Object.keys(params)
    .sort()
    .map(key => `${key}:${params[key]}`)
    .join('|');
  
  return `${prefix}:${paramString}`;
};

// Get data from cache
export const getFromCache = async (key) => {
  try {
    const cachedData = await redisClient.get(key);
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
};

// Set data in cache
export const setInCache = async (key, data, ttl = 300) => { // Default TTL: 5 minutes
  try {
    await redisClient.set(key, JSON.stringify(data), { EX: ttl });
  } catch (error) {
    console.error('Cache set error:', error);
  }
};

// Delete data from cache
export const deleteFromCache = async (key) => {
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error('Cache delete error:', error);
  }
};

// Invalidate cache by pattern
export const invalidateCachePattern = async (pattern) => {
  try {
    // Note: SCAN is not ideal for production, but works for our purposes
    // In production, you'd want to track keys by prefixes/patterns
  } catch (error) {
    console.error('Cache invalidate error:', error);
  }
};