import { Request, Response } from 'express';
import { ProjectEventModel } from '../models/project-event.model';
import { ProjectModel } from '../models/project.model';
import { DepartmentModel } from '../models/department.model';
import { catchAsync } from '../utils/async.utils';
import { AppError } from '../middleware/error.middleware';
import { Parser } from 'json2csv';
import { Readable } from 'stream';
import csv from 'csv-parser';
import mongoose from 'mongoose';

// Get all events
export const getAllEvents = catchAsync(async (_req: Request, res: Response) => {
  const events = await ProjectEventModel.find()
    .populate('departments', 'name code')
    .sort({ eventDate: -1 });

  res.status(200).json({
    status: 'success',
    data: {
      events
    }
  });
});

// Get active events (isActive = true)
export const getActiveEvents = catchAsync(async (_req: Request, res: Response) => {
  const events = await ProjectEventModel.find({ isActive: true })
    .populate('departments', 'name code')
    .sort({ eventDate: 1 });

  res.status(200).json({
    status: 'success',
    data: {
      events
    }
  });
});

// Get a single event by ID
export const getEvent = catchAsync(async (req: Request, res: Response) => {
  const event = await ProjectEventModel.findById(req.params.id)
    .populate('departments', 'name code');
  
  if (!event) {
    throw new AppError('Event not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      event
    }
  });
});

// Create a new event
export const createEvent = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to create an event', 401);
  }

  const {
    name,
    description,
    academicYear,
    eventDate,
    registrationStartDate,
    registrationEndDate,
    isActive,
    status,
    departments,
    schedule
  } = req.body;

  // Validate departments if provided
  if (departments && departments.length > 0) {
    const departmentCount = await DepartmentModel.countDocuments({
      _id: { $in: departments }
    });

    if (departmentCount !== departments.length) {
      throw new AppError('One or more departments are invalid', 400);
    }
  }

  // Create event
  const event = await ProjectEventModel.create({
    name,
    description,
    academicYear,
    eventDate,
    registrationStartDate,
    registrationEndDate,
    isActive,
    status,
    departments,
    schedule: schedule || [],
    publishResults: false,
    createdBy: req.user._id,
    updatedBy: req.user._id
  });

  res.status(201).json({
    status: 'success',
    data: {
      event
    }
  });
});

// Update an event
export const updateEvent = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to update an event', 401);
  }

  const eventId = req.params.id;
  const {
    name,
    description,
    academicYear,
    eventDate,
    registrationStartDate,
    registrationEndDate,
    isActive,
    status,
    departments
  } = req.body;

  // Validate departments if provided
  if (departments && departments.length > 0) {
    const departmentCount = await DepartmentModel.countDocuments({
      _id: { $in: departments }
    });

    if (departmentCount !== departments.length) {
      throw new AppError('One or more departments are invalid', 400);
    }
  }

  // Update event
  const updatedData: any = {
    updatedBy: req.user._id
  };

  if (name) updatedData.name = name;
  if (description) updatedData.description = description;
  if (academicYear) updatedData.academicYear = academicYear;
  if (eventDate) updatedData.eventDate = eventDate;
  if (registrationStartDate) updatedData.registrationStartDate = registrationStartDate;
  if (registrationEndDate) updatedData.registrationEndDate = registrationEndDate;
  if (isActive !== undefined) updatedData.isActive = isActive;
  if (status) updatedData.status = status;
  if (departments) updatedData.departments = departments;

  const event = await ProjectEventModel.findByIdAndUpdate(
    eventId,
    updatedData,
    { new: true, runValidators: true }
  ).populate('departments', 'name code');

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      event
    }
  });
});

// Delete an event
export const deleteEvent = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to delete an event', 401);
  }

  const eventId = req.params.id;
  
  // Check if there are any projects associated with this event
  const hasProjects = await ProjectModel.exists({ eventId });
  if (hasProjects) {
    throw new AppError('Cannot delete an event that has associated projects', 400);
  }

  // Delete the event
  const event = await ProjectEventModel.findByIdAndDelete(eventId);

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Publish/unpublish event results
export const publishResults = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to publish results', 401);
  }

  const eventId = req.params.id;
  const { publishResults } = req.body;
  
  // Update event
  const event = await ProjectEventModel.findByIdAndUpdate(
    eventId,
    {
      publishResults,
      updatedBy: req.user._id
    },
    { new: true, runValidators: true }
  );

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      event
    }
  });
});

// Get event schedule
export const getEventSchedule = catchAsync(async (req: Request, res: Response) => {
  const eventId = req.params.id;
  
  // Find event
  const event = await ProjectEventModel.findById(eventId);
  if (!event) {
    throw new AppError('Event not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      schedule: event.schedule || [],
      eventDate: event.eventDate
    }
  });
});

// Update event schedule
export const updateEventSchedule = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to update the schedule', 401);
  }

  const eventId = req.params.id;
  const { schedule } = req.body;
  
  if (!schedule || !Array.isArray(schedule)) {
    throw new AppError('Invalid schedule data', 400);
  }

  // Validate schedule items
  for (const item of schedule) {
    if (!item.time || !item.activity || !item.location || !item.coordinator) {
      throw new AppError('Invalid schedule item', 400);
    }
  }

  // Update event
  const event = await ProjectEventModel.findByIdAndUpdate(
    eventId,
    {
      schedule,
      updatedBy: req.user._id
    },
    { new: true, runValidators: true }
  );

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      schedule: event.schedule
    }
  });
});

// Export events to CSV
export const exportEventsToCsv = catchAsync(async (_req: Request, res: Response) => {
  const events = await ProjectEventModel.find()
    .populate('departments', 'name')
    .sort({ eventDate: -1 });

  // Format data for CSV
  const eventsData = events.map(event => {
    // Format departments
    const departments = event.departments.map((dept: any) => dept.name).join('; ');
    
    // Format schedule
    const scheduleItems = event.schedule.map((item: any) => 
      `${item.time} - ${item.activity} at ${item.location}`
    ).join('; ');

    return {
      'Name': event.name,
      'Description': event.description,
      'Academic Year': event.academicYear,
      'Event Date': event.eventDate ? new Date(event.eventDate).toISOString().split('T')[0] : '',
      'Registration Start Date': event.registrationStartDate ? new Date(event.registrationStartDate).toISOString().split('T')[0] : '',
      'Registration End Date': event.registrationEndDate ? new Date(event.registrationEndDate).toISOString().split('T')[0] : '',
      'Status': event.status,
      'Is Active': event.isActive ? 'Yes' : 'No',
      'Results Published': event.publishResults ? 'Yes' : 'No',
      'Departments': departments,
      'Schedule': scheduleItems,
      'Created At': event.createdAt ? new Date(event.createdAt).toISOString().split('T')[0] : ''
    };
  });

  // Generate CSV
  const fields = Object.keys(eventsData[0] || {});
  const parser = new Parser({ fields });
  const csv = parser.parse(eventsData);

  // Set headers for file download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=events.csv');
  
  res.status(200).send(csv);
});

// Import events from CSV
export const importEventsFromCsv = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  if (!req.user) {
    throw new AppError('You must be logged in to import events', 401);
  }

  // Parse CSV file
  const results: any[] = [];
  const fileContent = req.file.buffer.toString();
  const stream = Readable.from(fileContent);

  await new Promise<void>((resolve, reject) => {
    stream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve())
      .on('error', (error) => reject(new Error(`Error parsing CSV: ${error.message}`)));
  });

  if (results.length === 0) {
    throw new AppError('CSV file is empty or malformed', 400);
  }

  // Process each row in the CSV
  const importedEvents = [];
  const errors = [];

  for (const row of results) {
    try {
      // Validate required fields
      if (!row.Name || !row['Academic Year'] || !row['Event Date']) {
        throw new Error('Missing required fields: Name, Academic Year, and Event Date are required');
      }

      // Process departments
      let departments: mongoose.Types.ObjectId[] = [];
      if (row.Departments) {
        const departmentNames = row.Departments.split(';').map((name: string) => name.trim());
        
        // Find departments by name
        const foundDepartments = await DepartmentModel.find({
          name: { $in: departmentNames }
        });
        
        departments = foundDepartments.map(dept => dept._id);
        
        // Check if all departments were found
        if (departmentNames.length !== departments.length) {
          console.warn(`Not all departments were found for event: ${row.Name}`);
        }
      }

      // Create event
      const eventData = {
        name: row.Name,
        description: row.Description || '',
        academicYear: row['Academic Year'],
        eventDate: new Date(row['Event Date']),
        registrationStartDate: row['Registration Start Date'] ? new Date(row['Registration Start Date']) : new Date(),
        registrationEndDate: row['Registration End Date'] ? new Date(row['Registration End Date']) : new Date(),
        status: row.Status || 'upcoming',
        isActive: row['Is Active']?.toLowerCase() === 'yes',
        publishResults: row['Results Published']?.toLowerCase() === 'yes',
        departments,
        schedule: [],
        createdBy: req.user._id,
        updatedBy: req.user._id
      };

      // Process schedule if provided
      if (row.Schedule) {
        const scheduleItems = row.Schedule.split(';').map((item: string) => item.trim());
        
        eventData.schedule = scheduleItems.map((item: string) => {
          // Try to parse schedule item (format: "time - activity at location")
          const match = item.match(/([^-]+)-([^@]+)(?:at|@)(.+)/);
          
          if (match) {
            return {
              time: match[1].trim(),
              activity: match[2].trim(),
              location: match[3].trim(),
              coordinator: {
                userId: req.user?._id || 'TBA',
                name: 'TBA'
              },
              notes: ''
            };
          } else {
            return {
              time: 'TBA',
              activity: item,
              location: 'TBA',
              coordinator: {
                userId: req.user?._id || 'TBA',
                name: 'TBA'
              },
              notes: ''
            };
          }
        });
      }

      const event = await ProjectEventModel.create(eventData);
      importedEvents.push(event);
    } catch (error: any) {
      errors.push({
        row,
        error: error.message
      });
    }
  }

  res.status(201).json({
    status: 'success',
    data: {
      imported: importedEvents.length,
      errors: errors.length,
      errorDetails: errors
    }
  });
});