import { DepartmentModel } from '../models/department.model';
import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/gpp');
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

export const seedDepartments = async () => {
  try {
    const departments = [
      {
        name: 'Computer Engineering',
        code: '06',
        description: 'Department of Computer Engineering',
        establishedDate: new Date('2000-01-01'),
        isActive: true
      },
      {
        name: 'Civil Engineering', 
        code: '09',
        description: 'Department of Civil Engineering',
        establishedDate: new Date('2000-01-01'),
        isActive: true
      },
      {
        name: 'Electrical Engineering',
        code: '11',
        description: 'Department of Electrical Engineering', 
        establishedDate: new Date('2000-01-01'),
        isActive: true
      },
      {
        name: 'Information Technology',
        code: '17',
        description: 'Department of Information Technology',
        establishedDate: new Date('2000-01-01'),
        isActive: true
      },
      {
        name: 'Mechanical Engineering',
        code: '19',
        description: 'Department of Mechanical Engineering',
        establishedDate: new Date('2000-01-01'), 
        isActive: true
      },
      {
        name: 'CTSD',
        code: '83',
        description: 'Department of Craft and Technology Skill Development',
        establishedDate: new Date('2000-01-01'),
        isActive: true
      }
    ];

    const results = await Promise.all(
      departments.map(dept => 
        DepartmentModel.findOneAndUpdate(
          { code: dept.code },
          dept,
          { upsert: true, new: true }
        )
      )
    );

    console.log('Departments seeded successfully');
    return results;

  } catch (error) {
    console.error('Error seeding departments:', error);
    throw error;
  }
};

// Run seed if this file is run directly
if (require.main === module) {
  connectDB()
    .then(() => seedDepartments())
    .then(() => {
      console.log('Seeding completed');
      process.exit(0);
    })
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}
