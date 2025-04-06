import { Request, Response, NextFunction } from 'express';
import { RoleModel } from '../models/role.model';
import { AppError } from '../middleware/error.middleware';
import csv from 'csv-parser';
import { Readable } from 'stream';
import { createObjectCsvWriter } from 'csv-writer';

// Get all roles
export const getAllRoles = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const roles = await RoleModel.find();
    
    res.status(200).json({
      status: 'success',
      data: {
        roles
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get single role
export const getRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = await RoleModel.findById(req.params.id);
    
    if (!role) {
      return next(new AppError('Role not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        role
      }
    });
  } catch (error) {
    next(error);
  }
};

// Create role
export const createRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = await RoleModel.create(req.body);

    res.status(201).json({
      status: 'success',
      data: {
        role
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update role
export const updateRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = await RoleModel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!role) {
      return next(new AppError('Role not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        role
      }
    });
  } catch (error) {
    next(error);
  }
};

// Delete role
export const deleteRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = await RoleModel.findByIdAndDelete(req.params.id);

    if (!role) {
      return next(new AppError('Role not found', 404));
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

// Import roles from CSV
export const importRoles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return next(new AppError('Please upload a CSV file', 400));
    }

    interface ImportedRole {
      name: string;
      description: string;
      permissions: string[];
    }

    const roles: ImportedRole[] = [];
    const fileContent = req.file.buffer.toString();
    console.log('Received CSV content:', fileContent); // Debug log

    const stream = Readable.from(fileContent);
    let isFirstRow = true;

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({
          mapHeaders: ({ header }: { header: string }) => header.toLowerCase().trim(),
          mapValues: ({ value }: { value: string }) => value.trim()
        }))
        .on('data', (data: any) => {
          console.log('Parsing row:', data); // Debug log

          // Skip header row
          if (isFirstRow) {
            isFirstRow = false;
            return;
          }

          // Validate required fields
          if (!data.name) {
            console.log('Missing name in row:', data); // Debug log
            return; // Skip invalid rows instead of throwing error
          }

          // Prepare role data with defaults
          const role: ImportedRole = {
            name: data.name,
            description: data.description || 'No description',
            permissions: [] as string[]
          };

          // Handle permissions
          if (data.permissions) {
            const permissionsList = data.permissions.split(',').map((p: string) => p.trim());
            // Filter valid permissions
            role.permissions = permissionsList.filter((p: string) => 
              ['create', 'read', 'update', 'delete'].includes(p)
            );
          }

          // Ensure at least 'read' permission
          if (role.permissions.length === 0) {
            role.permissions = ['read'];
          }

          console.log('Processed role:', role); // Debug log
          roles.push(role);
        })
        .on('end', () => {
          console.log('Finished parsing CSV. Total roles:', roles.length); // Debug log
          resolve(null);
        })
        .on('error', (error) => {
          console.error('CSV parsing error:', error); // Debug log
          reject(error);
        });
    });

    if (roles.length === 0) {
      return next(new AppError('No valid roles found in CSV', 400));
    }

    // Handle each role individually to support upserts
    const results = await Promise.all(
      roles.map(async (role) => {
        try {
          // Try to update existing role, if not found create new one
          const result = await RoleModel.findOneAndUpdate(
            { name: role.name },
            { 
              $set: {
                description: role.description,
                permissions: role.permissions
              }
            },
            { upsert: true, new: true }
          );
          return { status: 'success', role: result };
        } catch (error: any) {
          return { status: 'error', error: error.message, role };
        }
      })
    );

    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'error');

    res.status(200).json({
      status: 'success',
      message: `${successful.length} roles processed (${failed.length} failed)`,
      data: {
        successful: successful.map(r => r.role),
        failed: failed.map(r => ({ role: r.role, error: r.error }))
      }
    });
  } catch (error: any) {
    console.error('Import error:', error); // Debug log
    next(new AppError(error.message || 'Error importing roles', 400));
  }
};

// Export roles to CSV
export const exportRoles = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const roles = await RoleModel.find();

    const csvWriter = createObjectCsvWriter({
      path: 'roles.csv',
      header: [
        { id: 'name', title: 'Name' },
        { id: 'description', title: 'Description' },
        { id: 'permissions', title: 'Permissions' }
      ]
    });

    await csvWriter.writeRecords(roles.map(role => ({
      name: role.name,
      description: role.description,
      permissions: role.permissions.join(',')
    })));

    res.download('roles.csv');
  } catch (error) {
    next(error);
  }
};
