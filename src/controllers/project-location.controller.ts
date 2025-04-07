import { Request, Response } from 'express';
import { ProjectLocationModel } from '../models/project-location.model';
import { ProjectModel } from '../models/project.model';
import { DepartmentModel } from '../models/department.model';
import { ProjectEventModel } from '../models/project-event.model';
import { catchAsync } from '../utils/async.utils';
import { AppError } from '../middleware/error.middleware';
import { Parser } from 'json2csv';
import { Readable } from 'stream';
import csv from 'csv-parser';
import mongoose from 'mongoose';

// Get all locations
export const getAllLocations = catchAsync(async (req: Request, res: Response) => {
  const { department, eventId, section, isAssigned } = req.query;

  // Build query based on provided filters
  const query: any = {};

  if (department) query.department = department;
  if (eventId) query.eventId = eventId;
  if (section) query.section = section;
  if (isAssigned !== undefined) {
    query.isAssigned = isAssigned === 'true';
  }

  // Pagination
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  // Execute query with pagination
  const locations = await ProjectLocationModel.find(query)
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'projectId', select: 'title teamId' }
    ])
    .sort({ section: 1, position: 1 })
    .skip(skip)
    .limit(limit);

  // Get total count for pagination
  const total = await ProjectLocationModel.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      locations,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// Get a single location by ID
export const getLocation = catchAsync(async (req: Request, res: Response) => {
  const location = await ProjectLocationModel.findById(req.params.id)
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'projectId', select: 'title teamId' }
    ]);

  if (!location) {
    throw new AppError('Location not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      location
    }
  });
});

// Create a new location
export const createLocation = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to create a location', 401);
  }

  const {
    locationId,
    section,
    position,
    department,
    eventId
  } = req.body;

  // Validate department
  const departmentExists = await DepartmentModel.findById(department);
  if (!departmentExists) {
    throw new AppError('Department not found', 404);
  }

  // Validate event
  const eventExists = await ProjectEventModel.findById(eventId);
  if (!eventExists) {
    throw new AppError('Event not found', 404);
  }

  // Check if locationId already exists
  const locationExists = await ProjectLocationModel.findOne({ locationId });
  if (locationExists) {
    throw new AppError(`Location ID '${locationId}' already exists`, 400);
  }

  // Create location
  const location = await ProjectLocationModel.create({
    locationId,
    section,
    position,
    department,
    eventId,
    isAssigned: false,
    createdBy: req.user._id,
    updatedBy: req.user._id
  });

  res.status(201).json({
    status: 'success',
    data: {
      location
    }
  });
});

// Create multiple locations in a batch
export const createLocationBatch = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to create locations', 401);
  }

  const {
    section,
    startPosition,
    endPosition,
    department,
    eventId
  } = req.body;

  if (!section || !startPosition || !endPosition || !department || !eventId) {
    throw new AppError('Missing required fields', 400);
  }

  // Validate department
  const departmentExists = await DepartmentModel.findById(department);
  if (!departmentExists) {
    throw new AppError('Department not found', 404);
  }

  // Validate event
  const eventExists = await ProjectEventModel.findById(eventId);
  if (!eventExists) {
    throw new AppError('Event not found', 404);
  }

  // Create location objects
  const locationData = [];
  for (let position = startPosition; position <= endPosition; position++) {
    const locationId = `${section}-${String(position).padStart(2, '0')}`;

    // Check if locationId already exists
    const locationExists = await ProjectLocationModel.findOne({ locationId });
    if (!locationExists) {
      locationData.push({
        locationId,
        section,
        position,
        department,
        eventId,
        isAssigned: false,
        createdBy: req.user._id,
        updatedBy: req.user._id
      });
    }
  }

  // Create locations
  const locations = await ProjectLocationModel.insertMany(locationData);

  res.status(201).json({
    status: 'success',
    data: {
      count: locations.length,
      locations
    }
  });
});

// Update a location
export const updateLocation = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to update a location', 401);
  }

  const locationId = req.params.id;
  const {
    section,
    position,
    department,
    eventId
  } = req.body;

  // Update location
  const updatedData: any = {
    updatedBy: req.user._id
  };

  if (section) updatedData.section = section;
  if (position) updatedData.position = position;
  if (department) updatedData.department = department;
  if (eventId) updatedData.eventId = eventId;

  const location = await ProjectLocationModel.findByIdAndUpdate(
    locationId,
    updatedData,
    { new: true, runValidators: true }
  ).populate([
    { path: 'department', select: 'name code' },
    { path: 'eventId', select: 'name eventDate' }
  ]);

  if (!location) {
    throw new AppError('Location not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      location
    }
  });
});

// Delete a location
export const deleteLocation = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to delete a location', 401);
  }

  const locationId = req.params.id;

  // Check if location is assigned to a project
  const location = await ProjectLocationModel.findById(locationId);
  if (!location) {
    throw new AppError('Location not found', 404);
  }

  if (location.isAssigned) {
    throw new AppError('Cannot delete a location that is assigned to a project', 400);
  }

  // Delete the location
  await ProjectLocationModel.findByIdAndDelete(locationId);

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Assign a project to a location
export const assignProjectToLocation = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to assign projects', 401);
  }

  const locationId = req.params.id;
  const { projectId } = req.body;

  if (!projectId) {
    throw new AppError('Project ID is required', 400);
  }

  // Check if location exists
  const location = await ProjectLocationModel.findById(locationId);
  if (!location) {
    throw new AppError('Location not found', 404);
  }

  // Check if location is already assigned
  if (location.isAssigned && location.projectId?.toString() !== projectId) {
    throw new AppError('Location is already assigned to another project', 400);
  }

  // Check if project exists
  const project = await ProjectModel.findById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  // Check if project is already assigned to a different location
  const existingLocation = await ProjectLocationModel.findOne({
    projectId,
    _id: { $ne: locationId }
  });

  if (existingLocation) {
    throw new AppError(`Project is already assigned to location ${existingLocation.locationId}`, 400);
  }

  // Update location with project
  const updatedLocation = await ProjectLocationModel.findByIdAndUpdate(
    locationId,
    {
      projectId,
      isAssigned: true,
      updatedBy: req.user._id
    },
    { new: true, runValidators: true }
  ).populate([
    { path: 'department', select: 'name code' },
    { path: 'eventId', select: 'name eventDate' },
    { path: 'projectId', select: 'title teamId' }
  ]);

  // Update project with location
  await ProjectModel.findByIdAndUpdate(
    projectId,
    {
      locationId,
      updatedBy: req.user._id
    },
    { new: true }
  );

  res.status(200).json({
    status: 'success',
    data: {
      location: updatedLocation
    }
  });
});

// Unassign a project from a location
export const unassignProjectFromLocation = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to unassign projects', 401);
  }

  const locationId = req.params.id;

  // Check if location exists
  const location = await ProjectLocationModel.findById(locationId);
  if (!location) {
    throw new AppError('Location not found', 404);
  }

  // Check if location is assigned
  if (!location.isAssigned || !location.projectId) {
    throw new AppError('Location is not assigned to any project', 400);
  }

  // Get project ID before updating
  const projectId = location.projectId;

  // Update location
  const updatedLocation = await ProjectLocationModel.findByIdAndUpdate(
    locationId,
    {
      projectId: null,
      isAssigned: false,
      updatedBy: req.user._id
    },
    { new: true, runValidators: true }
  ).populate([
    { path: 'department', select: 'name code' },
    { path: 'eventId', select: 'name eventDate' }
  ]);

  // Update project
  await ProjectModel.findByIdAndUpdate(
    projectId,
    {
      locationId: null,
      updatedBy: req.user._id
    },
    { new: true }
  );

  res.status(200).json({
    status: 'success',
    data: {
      location: updatedLocation
    }
  });
});

// Get locations by section
export const getLocationsBySection = catchAsync(async (req: Request, res: Response) => {
  const section = req.params.section;

  const locations = await ProjectLocationModel.find({ section })
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'projectId', select: 'title teamId' }
    ])
    .sort({ position: 1 });

  res.status(200).json({
    status: 'success',
    data: {
      locations
    }
  });
});

// Get locations by department
export const getLocationsByDepartment = catchAsync(async (req: Request, res: Response) => {
  const departmentId = req.params.departmentId;

  // Check if department exists
  const departmentExists = await DepartmentModel.findById(departmentId);
  if (!departmentExists) {
    throw new AppError('Department not found', 404);
  }

  const locations = await ProjectLocationModel.find({ department: departmentId })
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'projectId', select: 'title teamId' }
    ])
    .sort({ section: 1, position: 1 });

  res.status(200).json({
    status: 'success',
    data: {
      locations
    }
  });
});

// Get locations by event
export const getLocationsByEvent = catchAsync(async (req: Request, res: Response) => {
  const eventId = req.params.eventId;

  // Check if event exists
  const eventExists = await ProjectEventModel.findById(eventId);
  if (!eventExists) {
    throw new AppError('Event not found', 404);
  }

  const locations = await ProjectLocationModel.find({ eventId })
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'projectId', select: 'title teamId' }
    ])
    .sort({ section: 1, position: 1 });

  // Group locations by section
  const sectionMap = new Map();

  locations.forEach(location => {
    if (!sectionMap.has(location.section)) {
      sectionMap.set(location.section, []);
    }
    sectionMap.get(location.section).push(location);
  });

  // Convert map to array of objects
  const locationsBySection = Array.from(sectionMap.entries()).map(([section, locations]) => ({
    section,
    locations
  }));

  res.status(200).json({
    status: 'success',
    data: {
      sections: locationsBySection,
      totalLocations: locations.length,
      assignedLocations: locations.filter(loc => loc.isAssigned).length
    }
  });
});

// Export locations to CSV
export const exportLocationsToCsv = catchAsync(async (req: Request, res: Response) => {
  const { eventId } = req.query;

  // Build query
  const query: any = {};
  if (eventId) query.eventId = eventId;

  // Get locations
  const locations = await ProjectLocationModel.find(query)
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'projectId', select: 'title' }
    ])
    .sort({ section: 1, position: 1 });

  // Format data for CSV
  const locationsData = locations.map(location => {
    // Get related data
    const department = location.department as any;
    const event = location.eventId as any;
    const project = location.projectId as any;

    return {
      'Location ID': location.locationId,
      'Section': location.section,
      'Position': location.position,
      'Department': department?.name || 'Unknown',
      'Event': event?.name || 'Unknown',
      'Is Assigned': location.isAssigned ? 'Yes' : 'No',
      'Project': project?.title || 'None',
      'Created At': location.createdAt ? new Date(location.createdAt).toLocaleDateString() : ''
    };
  });

  // Generate CSV
  const fields = Object.keys(locationsData[0] || {});
  const parser = new Parser({ fields });
  const csv = parser.parse(locationsData);

  // Set headers for file download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=locations.csv');

  res.status(200).send(csv);
});

// Import locations from CSV
export const importLocationsFromCsv = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  if (!req.user) {
    throw new AppError('You must be logged in to import locations', 401);
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
  const importedLocations = [];
  const errors = [];

  for (const row of results) {
    try {
      // Validate required fields
      if (!row['Location ID'] || !row.Section || !row.Position || !row.Department || !row.Event) {
        throw new Error('Missing required fields');
      }

      // Find department by name
      const department = await DepartmentModel.findOne({ name: row.Department });
      if (!department) {
        throw new Error(`Department "${row.Department}" not found`);
      }

      // Find event by name
      const event = await ProjectEventModel.findOne({ name: row.Event });
      if (!event) {
        throw new Error(`Event "${row.Event}" not found`);
      }

      // Check if location ID already exists
      const existingLocation = await ProjectLocationModel.findOne({
        locationId: row['Location ID']
      });

      if (existingLocation) {
        throw new Error(`Location ID "${row['Location ID']}" already exists`);
      }

      // Create location
      const location = await ProjectLocationModel.create({
        locationId: row['Location ID'],
        section: row.Section,
        position: parseInt(row.Position),
        department: department._id,
        eventId: event._id,
        isAssigned: row['Is Assigned']?.toLowerCase() === 'yes',
        createdBy: req.user._id,
        updatedBy: req.user._id
      });

      importedLocations.push(location);
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
      imported: importedLocations.length,
      errors: errors.length,
      errorDetails: errors
    }
  });
});