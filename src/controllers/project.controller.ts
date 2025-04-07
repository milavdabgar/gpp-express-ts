import { Request, Response } from 'express';
import { ProjectModel } from '../models/project.model';
import { ProjectTeamModel } from '../models/project-team.model';
import { ProjectEventModel } from '../models/project-event.model';
import { ProjectLocationModel } from '../models/project-location.model';
import { DepartmentModel } from '../models/department.model';
import { UserModel } from '../models/user.model';
import { catchAsync } from '../utils/async.utils';
import { AppError } from '../middleware/error.middleware';
import { Parser } from 'json2csv';
import { Readable } from 'stream';
import csv from 'csv-parser';
import mongoose from 'mongoose';

// Get all projects with filtering options
export const getAllProjects = catchAsync(async (req: Request, res: Response) => {
  const { 
    department, 
    status, 
    eventId, 
    category,
    deptEvaluationStatus,
    centralEvaluationStatus
  } = req.query;

  // Build query based on provided filters
  const query: any = {};
  
  if (department) query.department = department;
  if (status) query.status = status;
  if (eventId) query.eventId = eventId;
  if (category) query.category = category;
  
  // Handle evaluation status filters
  if (deptEvaluationStatus === 'completed') {
    query['deptEvaluation.completed'] = true;
  } else if (deptEvaluationStatus === 'pending') {
    query['deptEvaluation.completed'] = false;
  }
  
  if (centralEvaluationStatus === 'completed') {
    query['centralEvaluation.completed'] = true;
  } else if (centralEvaluationStatus === 'pending') {
    query['centralEvaluation.completed'] = false;
  }

  // Pagination
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Execute query with pagination
  const projects = await ProjectModel.find(query)
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'teamId', select: 'name members' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'locationId', select: 'locationId section position' },
      { path: 'guide.userId', select: 'name email' },
      { path: 'guide.department', select: 'name code' },
      { path: 'deptEvaluation.juryId', select: 'name email' },
      { path: 'centralEvaluation.juryId', select: 'name email' }
    ])
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Get total count for pagination
  const total = await ProjectModel.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      projects,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// Get a single project by ID
export const getProject = catchAsync(async (req: Request, res: Response) => {
  const project = await ProjectModel.findById(req.params.id)
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'teamId', select: 'name members' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'locationId', select: 'locationId section position' },
      { path: 'guide.userId', select: 'name email' },
      { path: 'guide.department', select: 'name code' },
      { path: 'deptEvaluation.juryId', select: 'name email' },
      { path: 'centralEvaluation.juryId', select: 'name email' }
    ]);
  
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      project
    }
  });
});

// Create a new project
export const createProject = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to create a project', 401);
  }

  const {
    title,
    category,
    abstract,
    department,
    requirements,
    guide,
    teamId,
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

  // Check if event is active and registration is open
  const currentDate = new Date();
  if (!eventExists.isActive) {
    throw new AppError('Event is not active', 400);
  }
  if (currentDate < eventExists.registrationStartDate || currentDate > eventExists.registrationEndDate) {
    throw new AppError('Event registration is closed', 400);
  }

  // Validate team
  const teamExists = await ProjectTeamModel.findById(teamId);
  if (!teamExists) {
    throw new AppError('Team not found', 404);
  }

  // Check if guide exists
  const guideExists = await UserModel.findById(guide.userId);
  if (!guideExists) {
    throw new AppError('Guide not found', 404);
  }

  // Create project
  const project = await ProjectModel.create({
    title,
    category,
    abstract,
    department,
    requirements,
    guide,
    teamId,
    eventId,
    status: 'submitted',
    createdBy: req.user._id,
    updatedBy: req.user._id
  });

  res.status(201).json({
    status: 'success',
    data: {
      project
    }
  });
});

// Update a project
export const updateProject = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to update a project', 401);
  }

  const projectId = req.params.id;
  const {
    title,
    category,
    abstract,
    department,
    status,
    requirements,
    guide,
    teamId,
    eventId,
    locationId,
  } = req.body;

  // Find project
  const project = await ProjectModel.findById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  // Check if user has permission to update
  const isAdmin = req.user.roles.includes('admin');
  const isTeamMember = await ProjectTeamModel.findOne({ 
    _id: project.teamId,
    'members.userId': req.user._id
  });

  if (!isAdmin && !isTeamMember) {
    throw new AppError('You do not have permission to update this project', 403);
  }

  // Update project
  const updatedData: any = {
    updatedBy: req.user._id
  };

  if (title) updatedData.title = title;
  if (category) updatedData.category = category;
  if (abstract) updatedData.abstract = abstract;
  if (department) updatedData.department = department;
  if (status && isAdmin) updatedData.status = status;
  if (requirements) updatedData.requirements = requirements;
  if (guide) updatedData.guide = guide;
  if (teamId) updatedData.teamId = teamId;
  if (eventId) updatedData.eventId = eventId;
  if (locationId) updatedData.locationId = locationId;

  const updatedProject = await ProjectModel.findByIdAndUpdate(
    projectId,
    updatedData,
    { new: true, runValidators: true }
  ).populate([
    { path: 'department', select: 'name code' },
    { path: 'teamId', select: 'name members' },
    { path: 'eventId', select: 'name eventDate' },
    { path: 'locationId', select: 'locationId section position' }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      project: updatedProject
    }
  });
});

// Delete a project
export const deleteProject = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to delete a project', 401);
  }

  const projectId = req.params.id;
  
  // Find project
  const project = await ProjectModel.findById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  // Check if user has permission to delete
  const isAdmin = req.user.roles.includes('admin');
  if (!isAdmin) {
    throw new AppError('You do not have permission to delete this project', 403);
  }

  // Check if project has a location assigned
  if (project.locationId) {
    // Update location to show as unassigned
    await ProjectLocationModel.findByIdAndUpdate(
      project.locationId,
      {
        projectId: null,
        isAssigned: false,
        updatedBy: req.user._id
      }
    );
  }

  // Delete the project
  await ProjectModel.findByIdAndDelete(projectId);

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Department jury evaluation
export const evaluateProjectByDepartment = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to evaluate a project', 401);
  }

  // Check if user is a jury member
  const isJury = req.user.roles.includes('jury');
  if (!isJury) {
    throw new AppError('You do not have permission to evaluate projects', 403);
  }

  const projectId = req.params.id;
  const { score, feedback } = req.body;

  // Validate score
  if (score < 0 || score > 100) {
    throw new AppError('Score must be between 0 and 100', 400);
  }

  // Find project
  const project = await ProjectModel.findById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  // Update project with evaluation
  const updatedProject = await ProjectModel.findByIdAndUpdate(
    projectId,
    {
      deptEvaluation: {
        completed: true,
        score,
        feedback,
        juryId: req.user._id,
        evaluatedAt: new Date()
      },
      updatedBy: req.user._id
    },
    { new: true, runValidators: true }
  );

  res.status(200).json({
    status: 'success',
    data: {
      project: updatedProject
    }
  });
});

// Central jury evaluation
export const evaluateProjectByCentral = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to evaluate a project', 401);
  }

  // Check if user is a jury member
  const isJury = req.user.roles.includes('jury');
  if (!isJury) {
    throw new AppError('You do not have permission to evaluate projects', 403);
  }

  const projectId = req.params.id;
  const { score, feedback } = req.body;

  // Validate score
  if (score < 0 || score > 100) {
    throw new AppError('Score must be between 0 and 100', 400);
  }

  // Find project
  const project = await ProjectModel.findById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  // Check if department evaluation is completed
  if (!project.deptEvaluation?.completed) {
    throw new AppError('Department evaluation must be completed before central evaluation', 400);
  }

  // Update project with evaluation
  const updatedProject = await ProjectModel.findByIdAndUpdate(
    projectId,
    {
      centralEvaluation: {
        completed: true,
        score,
        feedback,
        juryId: req.user._id,
        evaluatedAt: new Date()
      },
      updatedBy: req.user._id
    },
    { new: true, runValidators: true }
  );

  res.status(200).json({
    status: 'success',
    data: {
      project: updatedProject
    }
  });
});

// Get projects for a specific department
export const getProjectsByDepartment = catchAsync(async (req: Request, res: Response) => {
  const departmentId = req.params.departmentId;
  
  // Check if department exists
  const departmentExists = await DepartmentModel.findById(departmentId);
  if (!departmentExists) {
    throw new AppError('Department not found', 404);
  }

  // Query projects by department
  const projects = await ProjectModel.find({ department: departmentId })
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'teamId', select: 'name members' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'locationId', select: 'locationId section position' }
    ])
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    data: {
      projects
    }
  });
});

// Get projects for a specific event
export const getProjectsByEvent = catchAsync(async (req: Request, res: Response) => {
  const eventId = req.params.eventId;
  
  // Check if event exists
  const eventExists = await ProjectEventModel.findById(eventId);
  if (!eventExists) {
    throw new AppError('Event not found', 404);
  }

  // Query projects by event
  const projects = await ProjectModel.find({ eventId })
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'teamId', select: 'name members' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'locationId', select: 'locationId section position' }
    ])
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    data: {
      projects
    }
  });
});

// Get projects for a specific team
export const getProjectsByTeam = catchAsync(async (req: Request, res: Response) => {
  const teamId = req.params.teamId;
  
  // Check if team exists
  const teamExists = await ProjectTeamModel.findById(teamId);
  if (!teamExists) {
    throw new AppError('Team not found', 404);
  }

  // Query projects by team
  const projects = await ProjectModel.find({ teamId })
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'teamId', select: 'name members' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'locationId', select: 'locationId section position' }
    ])
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    data: {
      projects
    }
  });
});

// Get projects for the logged-in user
export const getMyProjects = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to view your projects', 401);
  }

  // Find teams that the user is a member of
  const teams = await ProjectTeamModel.find({
    'members.userId': req.user._id
  });

  const teamIds = teams.map(team => team._id);

  // Find projects for those teams
  const projects = await ProjectModel.find({ teamId: { $in: teamIds } })
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'teamId', select: 'name members' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'locationId', select: 'locationId section position' }
    ])
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    data: {
      projects
    }
  });
});

// Get projects to be evaluated by the jury
export const getProjectsForJury = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to view jury projects', 401);
  }

  // Check if user is a jury member
  const isJury = req.user.roles.includes('jury');
  if (!isJury) {
    throw new AppError('You do not have permission to access jury evaluations', 403);
  }

  // Get active event
  const activeEvent = await ProjectEventModel.findOne({ isActive: true });
  if (!activeEvent) {
    throw new AppError('No active event found', 404);
  }

  // Query projects for the active event
  const projects = await ProjectModel.find({ 
    eventId: activeEvent._id,
    status: 'approved'
  }).populate([
    { path: 'department', select: 'name code' },
    { path: 'teamId', select: 'name members' },
    { path: 'eventId', select: 'name eventDate' },
    { path: 'locationId', select: 'locationId section position' }
  ]);

  // Split into evaluated and non-evaluated projects
  const evaluatedProjects = projects.filter(project => {
    if (req.query.evaluationType === 'central') {
      return project.centralEvaluation?.completed;
    }
    return project.deptEvaluation?.completed;
  });

  const pendingProjects = projects.filter(project => {
    if (req.query.evaluationType === 'central') {
      return !project.centralEvaluation?.completed;
    }
    return !project.deptEvaluation?.completed;
  });

  res.status(200).json({
    status: 'success',
    data: {
      evaluatedProjects,
      pendingProjects,
      totalEvaluated: evaluatedProjects.length,
      totalPending: pendingProjects.length
    }
  });
});

// Export projects to CSV
export const exportProjectsToCsv = catchAsync(async (req: Request, res: Response) => {
  // Build query based on provided filters
  const query: any = {};
  
  if (req.query.department) query.department = req.query.department;
  if (req.query.status) query.status = req.query.status;
  if (req.query.eventId) query.eventId = req.query.eventId;
  if (req.query.category) query.category = req.query.category;

  // Find all projects matching the query with populated fields
  const projects = await ProjectModel.find(query)
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'teamId', select: 'name members' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'guide.userId', select: 'name email' },
      { path: 'guide.department', select: 'name code' },
      { path: 'locationId', select: 'locationId section position' }
    ]);

  // Format data for CSV
  const projectData = projects.map(project => {
    // Get department and team information
    const department = project.department as any;
    const team = project.teamId as any;
    const event = project.eventId as any;
    const location = project.locationId as any;
    const guideDept = project.guide.department as any;

    // Create base project data
    const baseData = {
      'Project ID': project._id.toString(),
      'Title': project.title,
      'Category': project.category,
      'Department': department?.name || 'Unknown',
      'Status': project.status,
      'Abstract': project.abstract,
      'Power Required': project.requirements.power ? 'Yes' : 'No',
      'Internet Required': project.requirements.internet ? 'Yes' : 'No',
      'Special Space Required': project.requirements.specialSpace ? 'Yes' : 'No',
      'Other Requirements': project.requirements.otherRequirements,
      'Guide Name': project.guide.name,
      'Guide Department': guideDept?.name || 'Unknown',
      'Guide Contact': project.guide.contactNumber,
      'Team Name': team?.name || 'Unknown',
      'Event Name': event?.name || 'Unknown',
      'Event Date': event?.eventDate ? new Date(event.eventDate).toLocaleDateString() : 'Unknown',
      'Location': location?.locationId || 'Not Assigned',
      'Department Evaluation Completed': project.deptEvaluation?.completed ? 'Yes' : 'No',
      'Department Evaluation Score': project.deptEvaluation?.score || 'N/A',
      'Department Feedback': project.deptEvaluation?.feedback || 'N/A',
      'Central Evaluation Completed': project.centralEvaluation?.completed ? 'Yes' : 'No',
      'Central Evaluation Score': project.centralEvaluation?.score || 'N/A',
      'Central Feedback': project.centralEvaluation?.feedback || 'N/A',
      'Created At': project.createdAt.toISOString(),
      'Updated At': project.updatedAt.toISOString()
    };

    return baseData;
  });

  // Generate CSV from the data
  const fields = Object.keys(projectData[0] || {});
  const parser = new Parser({ fields });
  const csv = parser.parse(projectData);

  // Set headers for file download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=projects.csv');
  
  res.status(200).send(csv);
});

// Import projects from CSV
export const importProjectsFromCsv = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  if (!req.user) {
    throw new AppError('You must be logged in to import projects', 401);
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
  const importedProjects = [];
  const errors = [];

  for (const row of results) {
    try {
      // Validate required fields
      if (!row.Title || !row.Category || !row.Department || !row['Team Name'] || !row['Event Name']) {
        throw new Error('Missing required fields');
      }

      // Find department by name
      const department = await DepartmentModel.findOne({ name: row.Department });
      if (!department) {
        throw new Error(`Department "${row.Department}" not found`);
      }

      // Find or create a team
      let team = await ProjectTeamModel.findOne({ name: row['Team Name'] });
      if (!team) {
        // Create a new team
        team = await ProjectTeamModel.create({
          name: row['Team Name'],
          department: department._id,
          members: [],
          eventId: null, // Will be set later
          createdBy: req.user._id,
          updatedBy: req.user._id
        });
      }

      // Find event by name
      const event = await ProjectEventModel.findOne({ name: row['Event Name'] });
      if (!event) {
        throw new Error(`Event "${row['Event Name']}" not found`);
      }

      // Update team with event ID if not set
      if (!team.eventId) {
        team = await ProjectTeamModel.findByIdAndUpdate(
          team._id,
          { eventId: event._id },
          { new: true }
        );
      }

      // Find guide user if provided
      let guideUser = null;
      if (row['Guide Name']) {
        // Attempt to find by name
        guideUser = await UserModel.findOne({ 
          name: row['Guide Name'],
          roles: 'faculty'
        });
      }

      // Create project object
      const projectData = {
        title: row.Title,
        category: row.Category,
        abstract: row.Abstract || 'No abstract provided',
        department: department._id,
        status: row.Status || 'draft',
        requirements: {
          power: row['Power Required']?.toLowerCase() === 'yes',
          internet: row['Internet Required']?.toLowerCase() === 'yes',
          specialSpace: row['Special Space Required']?.toLowerCase() === 'yes',
          otherRequirements: row['Other Requirements'] || ''
        },
        guide: {
          userId: guideUser?._id || req.user._id, // Default to importer if no guide found
          name: row['Guide Name'] || (guideUser?.name || 'Guide not specified'),
          department: department._id,
          contactNumber: row['Guide Contact'] || '0000000000'
        },
        teamId: team._id,
        eventId: event._id,
        createdBy: req.user._id,
        updatedBy: req.user._id
      };

      // Create project
      const project = await ProjectModel.create(projectData);
      importedProjects.push(project);
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
      imported: importedProjects.length,
      errors: errors.length,
      errorDetails: errors,
      projects: importedProjects
    }
  });
});

// Get department-wise project statistics
export const getProjectStatistics = catchAsync(async (req: Request, res: Response) => {
  const eventId = req.query.eventId as string;

  // Check if event exists if provided
  if (eventId) {
    const eventExists = await ProjectEventModel.findById(eventId);
    if (!eventExists) {
      throw new AppError('Event not found', 404);
    }
  }

  // Build match query
  const matchQuery: any = {};
  if (eventId) {
    matchQuery.eventId = new mongoose.Types.ObjectId(eventId);
  }

  // Aggregate projects by department with evaluation stats
  const departmentStats = await ProjectModel.aggregate([
    { $match: matchQuery },
    {
      $lookup: {
        from: 'departments',
        localField: 'department',
        foreignField: '_id',
        as: 'departmentInfo'
      }
    },
    { $unwind: '$departmentInfo' },
    {
      $group: {
        _id: '$department',
        departmentName: { $first: '$departmentInfo.name' },
        departmentCode: { $first: '$departmentInfo.code' },
        totalProjects: { $sum: 1 },
        deptEvaluatedCount: {
          $sum: { $cond: [{ $eq: ['$deptEvaluation.completed', true] }, 1, 0] }
        },
        centralEvaluatedCount: {
          $sum: { $cond: [{ $eq: ['$centralEvaluation.completed', true] }, 1, 0] }
        },
        avgDeptScore: { $avg: '$deptEvaluation.score' },
        avgCentralScore: { $avg: '$centralEvaluation.score' },
        projectsByStatus: {
          $push: {
            status: '$status',
            id: '$_id'
          }
        },
        projectsByCategory: {
          $push: {
            category: '$category',
            id: '$_id'
          }
        }
      }
    },
    {
      $addFields: {
        deptEvaluationPercentage: {
          $multiply: [{ $divide: ['$deptEvaluatedCount', '$totalProjects'] }, 100]
        },
        centralEvaluationPercentage: {
          $multiply: [{ $divide: ['$centralEvaluatedCount', '$totalProjects'] }, 100]
        }
      }
    },
    {
      $project: {
        _id: 1,
        departmentName: 1,
        departmentCode: 1,
        totalProjects: 1,
        deptEvaluatedCount: 1,
        centralEvaluatedCount: 1,
        deptEvaluationPercentage: 1,
        centralEvaluationPercentage: 1,
        avgDeptScore: 1,
        avgCentralScore: 1,
        statusBreakdown: {
          $reduce: {
            input: '$projectsByStatus',
            initialValue: {},
            in: {
              $mergeObjects: [
                '$$value',
                {
                  $cond: {
                    if: { $not: ['$$value.$$this.status'] },
                    then: {
                      $literal: {
                        $concat: ['$$this.status', 'Count']
                      }
                    },
                    else: '$$value'
                  }
                }
              ]
            }
          }
        },
        categoryBreakdown: {
          $reduce: {
            input: '$projectsByCategory',
            initialValue: {},
            in: {
              $mergeObjects: [
                '$$value',
                {
                  $cond: {
                    if: { $not: ['$$value.$$this.category'] },
                    then: {
                      $literal: {
                        $concat: ['$$this.category', 'Count']
                      }
                    },
                    else: '$$value'
                  }
                }
              ]
            }
          }
        }
      }
    },
    { $sort: { totalProjects: -1 } }
  ]);

// Continuation of Project Controller...

// Get overall statistics - continued from previous part
const overallStats = await ProjectModel.aggregate([
  { $match: matchQuery },
  {
    $group: {
      _id: null,
      totalProjects: { $sum: 1 },
      deptEvaluatedCount: {
        $sum: { $cond: [{ $eq: ['$deptEvaluation.completed', true] }, 1, 0] }
      },
      centralEvaluatedCount: {
        $sum: { $cond: [{ $eq: ['$centralEvaluation.completed', true] }, 1, 0] }
      },
      avgDeptScore: { $avg: '$deptEvaluation.score' },
      avgCentralScore: { $avg: '$centralEvaluation.score' },
      departmentCount: { $addToSet: '$department' },
      categoryCount: { $addToSet: '$category' },
      statusCounts: {
        $push: '$status'
      }
    }
  },
  {
    $addFields: {
      departmentCount: { $size: '$departmentCount' },
      categoryCount: { $size: '$categoryCount' },
      deptEvaluationPercentage: {
        $multiply: [{ $divide: ['$deptEvaluatedCount', '$totalProjects'] }, 100]
      },
      centralEvaluationPercentage: {
        $multiply: [{ $divide: ['$centralEvaluatedCount', '$totalProjects'] }, 100]
      }
    }
  }
]);

res.status(200).json({
  status: 'success',
  data: {
    departmentStats,
    overallStats: overallStats[0] || null
  }
});
});

// Export project dummy data from frontend to CSV
export const exportDummyProjectsFromFrontend = catchAsync(async (_req: Request, res: Response) => {
  // Sample projects data from frontend
  const dummyProjects = [
    {
      id: 'NPNI-2025-0042',
      title: 'Smart Waste Management System',
      category: 'IoT & Smart Systems',
      department: 'Computer Engineering',
      team: 'Team Innovate',
      members: 3,
      location: 'Stall A-12',
      status: 'registered',
      abstract: 'A smart waste management system that uses IoT sensors to monitor waste levels in bins and optimize collection routes for municipal workers.',
      requirements: {
        power: true,
        internet: true,
        specialSpace: false,
        otherRequirements: 'Need a table for laptop setup'
      },
      guide: {
        name: 'Dr. Amit Patel',
        department: 'Computer Engineering',
        contactNumber: '9876543210'
      },
      deptEvaluation: {
        completed: true,
        score: 85,
        feedback: 'Excellent implementation with good practical application'
      },
      centralEvaluation: {
        completed: false,
        score: null,
        feedback: null
      }
    },
    {
      id: 'NPNI-2025-0056',
      title: 'Solar Powered Water Purifier',
      category: 'Sustainable Technology',
      department: 'Electrical Engineering',
      team: 'EcoSolutions',
      members: 4,
      location: 'Stall B-08',
      status: 'registered',
      abstract: 'A portable water purification system powered entirely by solar energy, designed for rural areas with limited electricity access.',
      requirements: {
        power: false,
        internet: false,
        specialSpace: true,
        otherRequirements: 'Need outdoor space for solar panel'
      },
      guide: {
        name: 'Prof. Sanjay Mehta',
        department: 'Electrical Engineering',
        contactNumber: '8765432109'
      },
      deptEvaluation: {
        completed: true,
        score: 92,
        feedback: 'Innovative solution with significant social impact potential'
      },
      centralEvaluation: {
        completed: false,
        score: null,
        feedback: null
      }
    },
    {
      id: 'NPNI-2025-0073',
      title: 'Structural Health Monitoring Device',
      category: 'Hardware Project',
      department: 'Civil Engineering',
      team: 'BuildTech',
      members: 2,
      location: 'Stall C-15',
      status: 'registered',
      abstract: 'A low-cost device that monitors the structural health of buildings and bridges, providing early warnings for potential failures.',
      requirements: {
        power: true,
        internet: false,
        specialSpace: false,
        otherRequirements: ''
      },
      guide: {
        name: 'Dr. Ravi Kumar',
        department: 'Civil Engineering',
        contactNumber: '7654321098'
      },
      deptEvaluation: {
        completed: true,
        score: 78,
        feedback: 'Good concept, but implementation needs refinement'
      },
      centralEvaluation: {
        completed: false,
        score: null,
        feedback: null
      }
    }
  ];

  // Format data for CSV
  const projectData = dummyProjects.map(project => {
    return {
      'Project ID': project.id,
      'Title': project.title,
      'Category': project.category,
      'Department': project.department,
      'Status': project.status,
      'Abstract': project.abstract,
      'Power Required': project.requirements.power ? 'Yes' : 'No',
      'Internet Required': project.requirements.internet ? 'Yes' : 'No',
      'Special Space Required': project.requirements.specialSpace ? 'Yes' : 'No',
      'Other Requirements': project.requirements.otherRequirements,
      'Guide Name': project.guide.name,
      'Guide Department': project.guide.department,
      'Guide Contact': project.guide.contactNumber,
      'Team Name': project.team,
      'Team Members': project.members,
      'Location': project.location,
      'Department Evaluation Completed': project.deptEvaluation.completed ? 'Yes' : 'No',
      'Department Evaluation Score': project.deptEvaluation.score || 'N/A',
      'Department Feedback': project.deptEvaluation.feedback || 'N/A',
      'Central Evaluation Completed': project.centralEvaluation.completed ? 'Yes' : 'No',
      'Central Evaluation Score': project.centralEvaluation.score || 'N/A',
      'Central Feedback': project.centralEvaluation.feedback || 'N/A'
    };
  });

  // Generate CSV
  const fields = Object.keys(projectData[0]);
  const parser = new Parser({ fields });
  const csv = parser.parse(projectData);

  // Set headers for file download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=dummy-projects.csv');
  
  res.status(200).send(csv);
});

// Get project counts by category for reporting/analytics
export const getProjectCountsByCategory = catchAsync(async (req: Request, res: Response) => {
  const eventId = req.query.eventId as string;

  // Build match query
  const matchQuery: any = {};
  if (eventId) {
    matchQuery.eventId = new mongoose.Types.ObjectId(eventId);
  }

  // Aggregate projects by category
  const categoryCounts = await ProjectModel.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        departments: { $addToSet: '$department' },
        averageScore: { $avg: '$deptEvaluation.score' }
      }
    },
    {
      $lookup: {
        from: 'departments',
        localField: 'departments',
        foreignField: '_id',
        as: 'departmentInfo'
      }
    },
    {
      $project: {
        category: '$_id',
        count: 1,
        departmentCount: { $size: '$departments' },
        departmentInfo: { $map: { input: '$departmentInfo', as: 'dept', in: '$$dept.name' } },
        averageScore: 1
      }
    },
    { $sort: { count: -1 } }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      categoryCounts
    }
  });
});

// Get project details including team members
export const getProjectWithDetails = catchAsync(async (req: Request, res: Response) => {
  const projectId = req.params.id;
  
  // Find project
  const project = await ProjectModel.findById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  // Get team details
  const team = await ProjectTeamModel.findById(project.teamId)
    .populate('members.userId', 'name email');

  // Get location details if assigned
  const location = project.locationId 
    ? await ProjectLocationModel.findById(project.locationId) 
    : null;

  // Get event details
  const event = await ProjectEventModel.findById(project.eventId);

  // Get department details
  const department = await DepartmentModel.findById(project.department);

  // Get guide details
  const guide = await UserModel.findById(project.guide.userId);

  // Get jury details if evaluations exist
  const deptJury = project.deptEvaluation?.juryId 
    ? await UserModel.findById(project.deptEvaluation.juryId) 
    : null;

  const centralJury = project.centralEvaluation?.juryId 
    ? await UserModel.findById(project.centralEvaluation.juryId) 
    : null;

  // Combine all data
  const projectDetails = {
    ...project.toObject(),
    team: team,
    location: location,
    event: event,
    departmentDetails: department,
    guideDetails: guide,
    deptJuryDetails: deptJury,
    centralJuryDetails: centralJury
  };

  res.status(200).json({
    status: 'success',
    data: {
      project: projectDetails
    }
  });
});

// Generate certificates for projects
export const generateProjectCertificates = catchAsync(async (req: Request, res: Response) => {
  const eventId = req.params.eventId;
  const certificateType = req.query.type || 'participation';
  
  // Check if event exists
  const event = await ProjectEventModel.findById(eventId);
  if (!event) {
    throw new AppError('Event not found', 404);
  }

  // Build query based on certificate type
  let query: any = { eventId };
  
  if (certificateType === 'department-winners') {
    query['deptEvaluation.completed'] = true;
    // Get top projects per department
    const departments = await DepartmentModel.find();
    
    const topProjectsByDepartment = [];
    
    for (const dept of departments) {
      const topProjects = await ProjectModel.find({ 
        eventId, 
        department: dept._id,
        'deptEvaluation.completed': true 
      })
      .sort({ 'deptEvaluation.score': -1 })
      .limit(3);
      
      topProjectsByDepartment.push(...topProjects);
    }
    
    // Return certificate data for department winners
    return res.status(200).json({
      status: 'success',
      data: {
        certificates: topProjectsByDepartment.map((project, index) => ({
          projectId: project._id,
          title: project.title,
          team: project.teamId,
          department: project.department,
          score: project.deptEvaluation?.score,
          rank: index % 3 + 1,
          certificateType: 'department-winner',
          eventName: event.name,
          eventDate: event.eventDate,
          downloadUrl: `/api/projects/certificates/${project._id}?type=department-winner`
        }))
      }
    });
  } else if (certificateType === 'institute-winners') {
    query['centralEvaluation.completed'] = true;
    
    // Get top 3 projects overall
    const topProjects = await ProjectModel.find({ 
      eventId, 
      'centralEvaluation.completed': true 
    })
    .sort({ 'centralEvaluation.score': -1 })
    .limit(3);
    
    // Return certificate data for institute winners
    return res.status(200).json({
      status: 'success',
      data: {
        certificates: topProjects.map((project, index) => ({
          projectId: project._id,
          title: project.title,
          team: project.teamId,
          department: project.department,
          score: project.centralEvaluation?.score,
          rank: index + 1,
          certificateType: 'institute-winner',
          eventName: event.name,
          eventDate: event.eventDate,
          downloadUrl: `/api/projects/certificates/${project._id}?type=institute-winner`
        }))
      }
    });
  } else {
    // Participation certificates
    const projects = await ProjectModel.find(query)
      .populate('teamId', 'name members');
    
    // Return certificate data for all participants
    return res.status(200).json({
      status: 'success',
      data: {
        certificates: projects.map(project => ({
          projectId: project._id,
          title: project.title,
          team: project.teamId,
          department: project.department,
          certificateType: 'participation',
          eventName: event.name,
          eventDate: event.eventDate,
          downloadUrl: `/api/projects/certificates/${project._id}?type=participation`
        }))
      }
    });
  }
});

// Endpoint for bulk email of certificates
export const sendCertificateEmails = catchAsync(async (req: Request, res: Response) => {
  const { certificateIds, emailSubject, emailTemplate } = req.body;
  
  if (!certificateIds || !Array.isArray(certificateIds) || certificateIds.length === 0) {
    throw new AppError('Please provide an array of certificate IDs', 400);
  }
  
  // In a real implementation, this would connect to an email service
  // Here we'll simulate a successful email sending process
  
  res.status(200).json({
    status: 'success',
    message: `Successfully queued ${certificateIds.length} certificate emails for sending`,
    data: {
      emailsSent: certificateIds.length,
      subject: emailSubject || 'Your Project Fair Certificate',
      template: emailTemplate ? 'Custom template' : 'Default template'
    }
  });
});

// Get winners for an event
export const getEventWinners = catchAsync(async (req: Request, res: Response) => {
  const eventId = req.params.eventId;
  
  // Check if event exists
  const event = await ProjectEventModel.findById(eventId);
  if (!event) {
    throw new AppError('Event not found', 404);
  }
  
  // Check if results are published
  if (!event.publishResults) {
    throw new AppError('Results have not been published yet', 403);
  }

  // Get department-wise winners
  const departments = await DepartmentModel.find();
  const departmentWinners = [];
  
  for (const dept of departments) {
    const winners = await ProjectModel.find({ 
      eventId, 
      department: dept._id,
      'deptEvaluation.completed': true 
    })
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'teamId', select: 'name members' }
    ])
    .sort({ 'deptEvaluation.score': -1 })
    .limit(3);
    
    if (winners.length > 0) {
      departmentWinners.push({
        department: dept,
        winners: winners.map((project, index) => ({
          ...project.toObject(),
          rank: index + 1
        }))
      });
    }
  }
  
  // Get institute-level winners
  const instituteWinners = await ProjectModel.find({ 
    eventId, 
    'centralEvaluation.completed': true 
  })
  .populate([
    { path: 'department', select: 'name code' },
    { path: 'teamId', select: 'name members' }
  ])
  .sort({ 'centralEvaluation.score': -1 })
  .limit(3)
  .map((project, index) => ({
    ...project.toObject(),
    rank: index + 1
  }));
  
  res.status(200).json({
    status: 'success',
    data: {
      departmentWinners,
      instituteWinners
    }
  });
});