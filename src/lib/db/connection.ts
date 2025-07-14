import mongoose from 'mongoose';

// Connection state tracking
let isConnected = false;

/**
 * Connect to MongoDB Atlas
 * @param connectionString MongoDB connection string
 */
export const connectToDatabase = async (connectionString: string) => {
  if (isConnected) {
    return;
  }

  if (!connectionString) {
    throw new Error('MongoDB connection string is required');
  }

  try {
    await mongoose.connect(connectionString);
    isConnected = true;
    console.log('Connected to MongoDB Atlas');
  } catch (error) {
    console.error('Failed to connect to MongoDB Atlas:', error);
    throw error;
  }
};

/**
 * Disconnect from MongoDB Atlas
 */
export const disconnectFromDatabase = async () => {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('Disconnected from MongoDB Atlas');
  } catch (error) {
    console.error('Failed to disconnect from MongoDB Atlas:', error);
  }
};
