import { Request, Response } from 'express';
import { ProjectTeamModel } from '../models/project-team.model';
import { ProjectModel } from '../models/project.model';
import { DepartmentModel } from '../models/department.model';
import { UserModel } from '../models/user.model';
import { StudentModel } from '../models/student.model';
import { catchAsync } from '../utils/async.utils';
import { AppError } from '../middleware/error.middleware';
import { Parser } from 'json2csv';
import { Readable } from 'stream';
import csv from 'csv-parser';
import mongoose from 'mongoose';

// Get all project teams
export const getAllTeams = catchAsync(async (req: Request, res: Response) => {
  const { department, eventId } = req.query;

  // Build query based on provided filters
  const query: any = {};
  
  if (department) query.department = department;
  if (eventId) query.eventId = eventId;

  // Pagination
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Execute query with pagination
  const teams = await ProjectTeamModel.find(query)
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'members.userId', select: 'name email' },
      { path: 'projects' }
    ])
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Get total count for pagination
  const total = await ProjectTeamModel.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      teams,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// Get a single team by ID
export const getTeam = catchAsync(async (req: Request, res: Response) => {
  const team = await ProjectTeamModel.findById(req.params.id)
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'members.userId', select: 'name email' },
      { path: 'projects' }
    ]);
  
  if (!team) {
    throw new AppError('Team not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: {
      team
    }
  });
});

// Create a new team
export const createTeam = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to create a team', 401);
  }

  const {
    name,
    department,
    members,
    eventId
  } = req.body;

  // Validate department
  const departmentExists = await DepartmentModel.findById(department);
  if (!departmentExists) {
    throw new AppError('Department not found', 404);
  }

  // Automatically add the current user to the team if not already included
  let teamMembers = [...members];
  
  // Check if current user is already in the team
  const currentUserIndex = teamMembers.findIndex(member => 
    member.userId && member.userId.toString() === req.user?._id.toString()
  );
  
  // If user is not in the team, add them as a leader
  if (currentUserIndex === -1) {
    // Get the user's student details for enrollment number
    const student = await StudentModel.findOne({ userId: req.user._id });
    
    teamMembers.push({
      userId: req.user._id,
      name: req.user.name,
      enrollmentNo: student?.enrollmentNo || 'Unknown',
      role: 'Team Leader',
      isLeader: true
    });
  } else if (!teamMembers[currentUserIndex].isLeader) {
    // Make sure at least one team member is a leader
    const hasLeader = teamMembers.some(member => member.isLeader);
    if (!hasLeader) {
      teamMembers[currentUserIndex].isLeader = true;
      teamMembers[currentUserIndex].role = 'Team Leader';
    }
  }

  // Validate team size
  if (teamMembers.length === 0) {
    throw new AppError('Team must have at least one member', 400);
  }

  if (teamMembers.length > 4) {
    throw new AppError('Team cannot have more than 4 members', 400);
  }

  // Create team
  const team = await ProjectTeamModel.create({
    name,
    department,
    members: teamMembers,
    eventId,
    createdBy: req.user._id,
    updatedBy: req.user._id
  });

  res.status(201).json({
    status: 'success',
    data: {
      team
    }
  });
});

// Update a team
export const updateTeam = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to update a team', 401);
  }

  const teamId = req.params.id;
  const {
    name,
    department,
    members,
    eventId
  } = req.body;

  // Find team
  const team = await ProjectTeamModel.findById(teamId);
  if (!team) {
    throw new AppError('Team not found', 404);
  }

  // Check if user has permission to update
  const isAdmin = req.user.roles.includes('admin');
  const isTeamMember = team.members.some(member => 
    member.userId.toString() === req.user?._id.toString()
  );

  if (!isAdmin && !isTeamMember) {
    throw new AppError('You do not have permission to update this team', 403);
  }

  // Validate team size if members are being updated
  if (members && members.length > 4) {
    throw new AppError('Team cannot have more than 4 members', 400);
  }

  if (members && members.length === 0) {
    throw new AppError('Team must have at least one member', 400);
  }

  // Ensure at least one leader in the team
  if (members) {
    const hasLeader = members.some(member => member.isLeader);
    if (!hasLeader) {
      throw new AppError('Team must have at least one leader', 400);
    }
  }

  // Update team
  const updatedData: any = {
    updatedBy: req.user._id
  };

  if (name) updatedData.name = name;
  if (department) updatedData.department = department;
  if (members) updatedData.members = members;
  if (eventId) updatedData.eventId = eventId;

  const updatedTeam = await ProjectTeamModel.findByIdAndUpdate(
    teamId,
    updatedData,
    { new: true, runValidators: true }
  ).populate([
    { path: 'department', select: 'name code' },
    { path: 'eventId', select: 'name eventDate' },
    { path: 'members.userId', select: 'name email' }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      team: updatedTeam
    }
  });
});

// Delete a team
export const deleteTeam = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to delete a team', 401);
  }

  const teamId = req.params.id;
  
  // Find team
  const team = await ProjectTeamModel.findById(teamId);
  if (!team) {
    throw new AppError('Team not found', 404);
  }

  // Check if user has permission to delete
  const isAdmin = req.user.roles.includes('admin');
  if (!isAdmin) {
    throw new AppError('You do not have permission to delete this team', 403);
  }

  // Check if team has any projects
  const hasProjects = await ProjectModel.exists({ teamId });
  if (hasProjects) {
    throw new AppError('Cannot delete team with associated projects', 400);
  }

  // Delete the team
  await ProjectTeamModel.findByIdAndDelete(teamId);

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Get teams for a specific department
export const getTeamsByDepartment = catchAsync(async (req: Request, res: Response) => {
  const departmentId = req.params.departmentId;
  
  // Check if department exists
  const departmentExists = await DepartmentModel.findById(departmentId);
  if (!departmentExists) {
    throw new AppError('Department not found', 404);
  }

  // Query teams by department
  const teams = await ProjectTeamModel.find({ department: departmentId })
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'members.userId', select: 'name email' }
    ])
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    data: {
      teams
    }
  });
});

// Get teams for a specific event
export const getTeamsByEvent = catchAsync(async (req: Request, res: Response) => {
  const eventId = req.params.eventId;
  
  // Query teams by event
  const teams = await ProjectTeamModel.find({ eventId })
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'members.userId', select: 'name email' }
    ])
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    data: {
      teams
    }
  });
});

// Get teams for the logged-in user
export const getMyTeams = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to view your teams', 401);
  }

  // Find teams that the user is a member of
  const teams = await ProjectTeamModel.find({
    'members.userId': req.user._id
  }).populate([
    { path: 'department', select: 'name code' },
    { path: 'eventId', select: 'name eventDate' },
    { path: 'members.userId', select: 'name email' }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      teams
    }
  });
});

// Export teams to CSV
export const exportTeamsToCsv = catchAsync(async (req: Request, res: Response) => {
  // Build query based on provided filters
  const query: any = {};
  
  if (req.query.department) query.department = req.query.department;
  if (req.query.eventId) query.eventId = req.query.eventId;

  // Find all teams matching the query with populated fields
  const teams = await ProjectTeamModel.find(query)
    .populate([
      { path: 'department', select: 'name code' },
      { path: 'eventId', select: 'name eventDate' },
      { path: 'members.userId', select: 'name email' },
      { path: 'createdBy', select: 'name email' }
    ]);

  // Format data for CSV
  const teamData = teams.map(team => {
    // Get department and event information
    const department = team.department as any;
    const event = team.eventId as any;
    const creator = team.createdBy as any;

    // Process team members
    const members = team.members.map((member, index) => {
      const user = member.userId as any;
      return {
        [`Member ${index + 1} Name`]: member.name || (user?.name || ''),
        [`Member ${index + 1} Email`]: user?.email || '',
        [`Member ${index + 1} Enrollment`]: member.enrollmentNo || '',
        [`Member ${index + 1} Role`]: member.role || '',
        [`Member ${index + 1} Is Leader`]: member.isLeader ? 'Yes' : 'No'
      };
    });

    // Combine all member data into a single object
    const memberData = members.reduce((acc, curr) => ({ ...acc, ...curr }), {});

    // Create base team data
    const baseData = {
      'Team ID': team._id.toString(),
      'Team Name': team.name,
      'Department': department?.name || 'Unknown',
      'Department Code': department?.code || 'Unknown',
      'Event': event?.name || 'Unknown',
      'Event Date': event?.eventDate ? new Date(event.eventDate).toLocaleDateString() : 'Unknown',
      'Member Count': team.members.length,
      'Created By': creator?.name || 'Unknown',
      'Created At': team.createdAt.toISOString(),
      'Updated At': team.updatedAt.toISOString()
    };

    // Combine base data with member data
    return {
      ...baseData,
      ...memberData
    };
  });

// Continuation of ProjectTeam Controller...

// Generate CSV from the data - continued from previous part
const fields = Object.keys(teamData[0] || {});
const parser = new Parser({ fields });
const csv = parser.parse(teamData);

// Set headers for file download
res.setHeader('Content-Type', 'text/csv');
res.setHeader('Content-Disposition', 'attachment; filename=teams.csv');

res.status(200).send(csv);
});

// Import teams from CSV
export const importTeamsFromCsv = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  if (!req.user) {
    throw new AppError('You must be logged in to import teams', 401);
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
  const importedTeams = [];
  const errors = [];

  for (const row of results) {
    try {
      // Validate required fields
      if (!row['Team Name'] || !row['Department']) {
        throw new Error('Missing required fields: Team Name and Department are required');
      }

      // Find department by name
      const department = await DepartmentModel.findOne({ name: row['Department'] });
      if (!department) {
        throw new Error(`Department "${row['Department']}" not found`);
      }

      // Find event by name if provided
      let eventId = null;
      if (row['Event']) {
        const event = await mongoose.model('ProjectEvent').findOne({ name: row['Event'] });
        if (!event) {
          throw new Error(`Event "${row['Event']}" not found`);
        }
        eventId = event._id;
      }

      // Process team members
      const members = [];
      
      // Look for member columns in the format "Member X Name", "Member X Email", etc.
      for (let i = 1; i <= 4; i++) {
        const memberName = row[`Member ${i} Name`];
        const memberEmail = row[`Member ${i} Email`];
        const memberEnrollment = row[`Member ${i} Enrollment`];
        const memberRole = row[`Member ${i} Role`];
        const isLeader = row[`Member ${i} Is Leader`]?.toLowerCase() === 'yes';
        
        if (memberName && memberEmail) {
          // Try to find user by email
          let user = await UserModel.findOne({ email: memberEmail });
          
          if (!user) {
            // Create a new user if not found
            user = await UserModel.create({
              name: memberName,
              email: memberEmail,
              password: 'password123', // This should be a secure random password in production
              roles: ['student'],
              selectedRole: 'student',
              department: department._id
            });
          }
          
          members.push({
            userId: user._id,
            name: memberName,
            enrollmentNo: memberEnrollment || '',
            role: memberRole || 'Member',
            isLeader: isLeader
          });
        }
      }
      
      // Ensure at least one member is a leader
      if (members.length > 0 && !members.some(m => m.isLeader)) {
        members[0].isLeader = true;
        members[0].role = 'Team Leader';
      }

      // Create team
      const team = await ProjectTeamModel.create({
        name: row['Team Name'],
        department: department._id,
        members,
        eventId,
        createdBy: req.user._id,
        updatedBy: req.user._id
      });

      importedTeams.push(team);
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
      imported: importedTeams.length,
      errors: errors.length,
      errorDetails: errors,
      teams: importedTeams
    }
  });
});

// Export dummy team data from frontend to CSV
export const exportDummyTeamsFromFrontend = catchAsync(async (_req: Request, res: Response) => {
  // Sample teams data from frontend
  const dummyTeams = [
    {
      id: 'TEAM001',
      name: 'Team Innovate',
      department: 'Computer Engineering',
      members: [
        { name: 'John Doe', enrollmentNo: 'CE2025001', role: 'Team Lead', isLeader: true },
        { name: 'Jane Smith', enrollmentNo: 'CE2025002', role: 'Developer', isLeader: false },
        { name: 'Mike Johnson', enrollmentNo: 'CE2025003', role: 'Hardware Design', isLeader: false }
      ],
      eventName: 'NPNI Project Fair 2025'
    },
    {
      id: 'TEAM002',
      name: 'EcoSolutions',
      department: 'Electrical Engineering',
      members: [
        { name: 'Sarah Williams', enrollmentNo: 'EE2025001', role: 'Team Lead', isLeader: true },
        { name: 'James Brown', enrollmentNo: 'EE2025002', role: 'Circuit Designer', isLeader: false },
        { name: 'Emily Davis', enrollmentNo: 'EE2025003', role: 'Power Engineer', isLeader: false },
        { name: 'Robert Wilson', enrollmentNo: 'EE2025004', role: 'Tester', isLeader: false }
      ],
      eventName: 'NPNI Project Fair 2025'
    },
    {
      id: 'TEAM003',
      name: 'BuildTech',
      department: 'Civil Engineering',
      members: [
        { name: 'David Lee', enrollmentNo: 'CE2025010', role: 'Team Lead', isLeader: true },
        { name: 'Lisa Chen', enrollmentNo: 'CE2025011', role: 'Structural Analyst', isLeader: false }
      ],
      eventName: 'NPNI Project Fair 2025'
    }
  ];

  // Format data for CSV
  const teamData = dummyTeams.map(team => {
    // Process team members
    const members = team.members.map((member, index) => {
      return {
        [`Member ${index + 1} Name`]: member.name,
        [`Member ${index + 1} Enrollment`]: member.enrollmentNo,
        [`Member ${index + 1} Role`]: member.role,
        [`Member ${index + 1} Is Leader`]: member.isLeader ? 'Yes' : 'No'
      };
    });

    // Combine all member data into a single object
    const memberData = members.reduce((acc, curr) => ({ ...acc, ...curr }), {});

    // Create base team data
    const baseData = {
      'Team ID': team.id,
      'Team Name': team.name,
      'Department': team.department,
      'Event': team.eventName,
      'Member Count': team.members.length
    };

    // Combine base data with member data
    return {
      ...baseData,
      ...memberData
    };
  });

  // Generate CSV
  const fields = Object.keys(teamData[0]);
  const parser = new Parser({ fields });
  const csv = parser.parse(teamData);

  // Set headers for file download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=dummy-teams.csv');
  
  res.status(200).send(csv);
});

// Get member information for a team
export const getTeamMembers = catchAsync(async (req: Request, res: Response) => {
  const teamId = req.params.id;
  
  // Find team
  const team = await ProjectTeamModel.findById(teamId);
  if (!team) {
    throw new AppError('Team not found', 404);
  }

  // Get detailed user information for each member
  const memberDetails = await Promise.all(
    team.members.map(async (member) => {
      const user = await UserModel.findById(member.userId);
      const student = await StudentModel.findOne({ userId: member.userId });
      
      return {
        ...member.toObject(),
        userDetails: user,
        studentDetails: student
      };
    })
  );

  res.status(200).json({
    status: 'success',
    data: {
      teamId: team._id,
      teamName: team.name,
      members: memberDetails
    }
  });
});

// Add member to a team
export const addTeamMember = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to update a team', 401);
  }

  const teamId = req.params.id;
  const { userId, name, enrollmentNo, role, isLeader } = req.body;
  
  // Find team
  const team = await ProjectTeamModel.findById(teamId);
  if (!team) {
    throw new AppError('Team not found', 404);
  }

  // Check if user has permission to update
  const isAdmin = req.user.roles.includes('admin');
  const isTeamMember = team.members.some(member => 
    member.userId.toString() === req.user?._id.toString()
  );

  if (!isAdmin && !isTeamMember) {
    throw new AppError('You do not have permission to update this team', 403);
  }

  // Check if team already has 4 members
  if (team.members.length >= 4) {
    throw new AppError('Team cannot have more than 4 members', 400);
  }

  // Check if user exists
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Check if user is already a member of the team
  const isAlreadyMember = team.members.some(member => 
    member.userId.toString() === userId
  );

  if (isAlreadyMember) {
    throw new AppError('User is already a member of this team', 400);
  }

  // Add member to team
  const newMember = {
    userId,
    name: name || user.name,
    enrollmentNo: enrollmentNo || '',
    role: role || 'Member',
    isLeader: isLeader || false
  };

  team.members.push(newMember);
  team.updatedBy = req.user._id;
  
  await team.save();

  res.status(200).json({
    status: 'success',
    data: {
      team
    }
  });
});

// Remove member from a team
export const removeTeamMember = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to update a team', 401);
  }

  const teamId = req.params.id;
  const { userId } = req.params;
  
  // Find team
  const team = await ProjectTeamModel.findById(teamId);
  if (!team) {
    throw new AppError('Team not found', 404);
  }

  // Check if user has permission to update
  const isAdmin = req.user.roles.includes('admin');
  const isTeamLeader = team.members.some(member => 
    member.userId.toString() === req.user?._id.toString() && member.isLeader
  );

  if (!isAdmin && !isTeamLeader) {
    throw new AppError('You do not have permission to remove members from this team', 403);
  }

  // Check if team already has only one member
  if (team.members.length <= 1) {
    throw new AppError('Team must have at least one member', 400);
  }

  // Check if member is the last leader
  const isOnlyLeader = team.members.filter(m => m.isLeader).length === 1 && 
                      team.members.find(m => m.userId.toString() === userId)?.isLeader;
  
  if (isOnlyLeader) {
    throw new AppError('Cannot remove the only team leader. Assign another leader first.', 400);
  }

  // Remove member from team
  team.members = team.members.filter(member => member.userId.toString() !== userId);
  team.updatedBy = req.user._id;
  
  await team.save();

  res.status(200).json({
    status: 'success',
    data: {
      team
    }
  });
});

// Make a team member the leader
export const setTeamLeader = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('You must be logged in to update a team', 401);
  }

  const teamId = req.params.id;
  const { userId } = req.params;
  
  // Find team
  const team = await ProjectTeamModel.findById(teamId);
  if (!team) {
    throw new AppError('Team not found', 404);
  }

  // Check if user has permission to update
  const isAdmin = req.user.roles.includes('admin');
  const isTeamLeader = team.members.some(member => 
    member.userId.toString() === req.user?._id.toString() && member.isLeader
  );

  if (!isAdmin && !isTeamLeader) {
    throw new AppError('You do not have permission to change team leaders', 403);
  }

  // Check if member exists in the team
  const memberIndex = team.members.findIndex(member => member.userId.toString() === userId);
  if (memberIndex === -1) {
    throw new AppError('User is not a member of this team', 404);
  }

  // Update team members: set the specified member as leader and others as non-leaders
  team.members = team.members.map(member => ({
    ...member.toObject(),
    isLeader: member.userId.toString() === userId,
    role: member.userId.toString() === userId ? 'Team Leader' : member.role
  }));
  
  team.updatedBy = req.user._id;
  await team.save();

  res.status(200).json({
    status: 'success',
    data: {
      team
    }
  });
});