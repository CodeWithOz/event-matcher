import mongoose from 'mongoose';

/**
 * Connect to MongoDB Atlas
 * @param connectionString MongoDB connection string
 */
export const connectToDatabase = async (connectionString: string) => {
  if (!connectionString) {
    throw new Error('MongoDB connection string is required');
  }

  try {
    // Check the connection state
    const connectionState = mongoose.connection.readyState;
    
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    if (connectionState === 1) {
      console.log('Already connected to MongoDB Atlas');
      return;
    }
    
    // If connecting, wait for connection
    if (connectionState === 2) {
      console.log('Connection to MongoDB Atlas in progress...');
      // Wait for connection to establish
      await new Promise(resolve => {
        mongoose.connection.once('connected', resolve);
      });
      console.log('Connected to MongoDB Atlas');
      return;
    }
    
    // If disconnected or disconnecting, establish a new connection
    await mongoose.connect(connectionString);
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
  const connectionState = mongoose.connection.readyState;
  
  // Only disconnect if connected (1) or connecting (2)
  if (connectionState === 0 || connectionState === 3) {
    console.log('Not connected to MongoDB Atlas');
    return;
  }

  try {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB Atlas');
  } catch (error) {
    console.error('Failed to disconnect from MongoDB Atlas:', error);
  }
};
