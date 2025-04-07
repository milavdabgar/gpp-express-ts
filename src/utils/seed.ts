
import { DepartmentModel } from '../models/department.model';
import { UserModel } from '../models/user.model';
import { ProjectTeamModel } from '../models/project-team.model';
import { ProjectEventModel } from '../models/project-event.model';

export const seedData = async () => {
  try {
    // Create departments
    const departments = await DepartmentModel.create([
      {
        name: 'Computer Engineering',
        code: 'CE',
        description: 'Department of Computer Engineering',
        establishedDate: new Date('2000-01-01'),
        isActive: true
      },
      {
        name: 'Electrical Engineering',
        code: 'EE',
        description: 'Department of Electrical Engineering',
        establishedDate: new Date('2000-01-01'),
        isActive: true
      }
    ]);

    // Create users (faculty)
    const users = await UserModel.create([
      {
        name: 'Dr. Sarah Johnson',
        email: 'sarah.johnson@example.com',
        role: 'faculty',
        department: departments[0]._id,
        contactNumber: '+91 98765 43210',
        isActive: true
      },
      {
        name: 'Prof. Michael Chen',
        email: 'michael.chen@example.com',
        role: 'faculty',
        department: departments[1]._id,
        contactNumber: '+91 98765 43211',
        isActive: true
      }
    ]);

    // Create project event
    const event = await ProjectEventModel.create({
      name: 'Project Fair 2025',
      description: 'Annual project exhibition showcasing student innovations',
      startDate: new Date('2025-04-09'),
      endDate: new Date('2025-04-10'),
      registrationStartDate: new Date('2025-03-01'),
      registrationEndDate: new Date('2025-03-31'),
      isActive: true
    });

    // Create project teams
    const teams = await ProjectTeamModel.create([
      {
        name: 'Team Innovate',
        members: 3,
        department: departments[0]._id,
        eventId: event._id,
        isActive: true
      },
      {
        name: 'EcoSolutions',
        members: 4,
        department: departments[1]._id,
        eventId: event._id,
        isActive: true
      }
    ]);

    console.log('Seed data created successfully');
    return {
      departments,
      users,
      event,
      teams
    };
  } catch (error) {
    console.error('Error seeding data:', error);
    throw error;
  }
};
