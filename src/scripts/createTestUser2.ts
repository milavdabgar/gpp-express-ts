import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { UserModel } from '../models/user.model';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gpp-portal';

async function createTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Create test user with multiple roles
    const testUser = await UserModel.create({
      name: 'Jane Smith',
      email: 'jane.smith@gppalanpur.in',
      password: 'Test@123',
      department: 'Computer Engineering',
      roles: ['student', 'jury'], // This user can switch between student and jury roles
      selectedRole: 'student'
    });

    console.log('Test user created successfully:', testUser);
    process.exit(0);
  } catch (error) {
    console.error('Error creating test user:', error);
    process.exit(1);
  }
}

createTestUser();
