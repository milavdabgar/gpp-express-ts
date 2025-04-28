import express from 'express';
import multer from 'multer';
import * as projectController from '../controllers/project.controller';
import * as projectTeamController from '../controllers/project-team.controller';
import * as projectEventController from '../controllers/project-event.controller';
import * as projectLocationController from '../controllers/project-location.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public routes
router.get('/events/active', projectEventController.getActiveEvents);

// Protect all routes after this middleware
router.use(protect);

/*
 * Project Routes
 */
router.route('/')
  .get(projectController.getAllProjects)
  .post(projectController.createProject);

router.route('/my-projects')
  .get(projectController.getMyProjects);

router.route('/dummy-export')
  .get(projectController.exportDummyProjectsFromFrontend);

router.route('/export')
  .get(projectController.exportProjectsToCsv);

router.route('/import')
  .post(restrictTo('admin'), upload.single('file'), projectController.importProjectsFromCsv);

router.route('/statistics')
  .get(projectController.getProjectStatistics);

router.route('/categories')
  .get(projectController.getProjectCountsByCategory);

router.route('/jury-assignments')
  .get(restrictTo('jury'), projectController.getProjectsForJury);

/*
 * Location Routes - Moved before parameterized routes
 */
router.route('/locations')
  .get(projectLocationController.getAllLocations)
  .post(restrictTo('admin'), projectLocationController.createLocation);

router.route('/locations/export')
  .get(projectLocationController.exportLocationsToCsv);

router.route('/locations/import')
  .post(restrictTo('admin'), upload.single('file'), projectLocationController.importLocationsFromCsv);

router.route('/locations/batch')
  .post(restrictTo('admin'), projectLocationController.createLocationBatch);

router.route('/locations/section/:section')
  .get(projectLocationController.getLocationsBySection);

router.route('/locations/department/:departmentId')
  .get(projectLocationController.getLocationsByDepartment);

router.route('/locations/event/:eventId')
  .get(projectLocationController.getLocationsByEvent);

router.route('/locations/:id')
  .get(projectLocationController.getLocation)
  .patch(restrictTo('admin'), projectLocationController.updateLocation)
  .delete(restrictTo('admin'), projectLocationController.deleteLocation);

router.route('/locations/:id/assign')
  .patch(restrictTo('admin'), projectLocationController.assignProjectToLocation);

router.route('/locations/:id/unassign')
  .patch(restrictTo('admin'), projectLocationController.unassignProjectFromLocation);

/*
 * Event Routes
 */
router.route('/events')
  .get(projectEventController.getAllEvents)
  .post(restrictTo('admin'), projectEventController.createEvent);

router.route('/events/export')
  .get(projectEventController.exportEventsToCsv);

router.route('/events/import')
  .post(restrictTo('admin'), upload.single('file'), projectEventController.importEventsFromCsv);

router.route('/events/:id')
  .get(projectEventController.getEvent)
  .patch(restrictTo('admin'), projectEventController.updateEvent)
  .delete(restrictTo('admin'), projectEventController.deleteEvent);

router.route('/events/:id/publish-results')
  .patch(restrictTo('admin'), projectEventController.publishResults);

router.route('/events/:id/schedule')
  .get(projectEventController.getEventSchedule)
  .patch(restrictTo('admin'), projectEventController.updateEventSchedule);

/*
 * Team Routes
 */
router.route('/teams')
  .get(projectTeamController.getAllTeams)
  .post(projectTeamController.createTeam);

router.route('/teams/my-teams')
  .get(projectTeamController.getMyTeams);

router.route('/teams/dummy-export')
  .get(projectTeamController.exportDummyTeamsFromFrontend);

router.route('/teams/export')
  .get(projectTeamController.exportTeamsToCsv);

router.route('/teams/import')
  .post(restrictTo('admin'), upload.single('file'), projectTeamController.importTeamsFromCsv);

router.route('/teams/department/:departmentId')
  .get(projectTeamController.getTeamsByDepartment);

router.route('/teams/event/:eventId')
  .get(projectTeamController.getTeamsByEvent);

router.route('/teams/:id')
  .get(projectTeamController.getTeam)
  .patch(projectTeamController.updateTeam)
  .delete(restrictTo('admin'), projectTeamController.deleteTeam);

router.route('/teams/:id/members')
  .get(projectTeamController.getTeamMembers)
  .post(projectTeamController.addTeamMember);

router.route('/teams/:id/members/:userId')
  .delete(projectTeamController.removeTeamMember);

router.route('/teams/:id/leader/:userId')
  .patch(projectTeamController.setTeamLeader);

/*
 * Project Detail Routes - Move parameterized routes last
 */
router.route('/department/:departmentId')
  .get(projectController.getProjectsByDepartment);

router.route('/event/:eventId')
  .get(projectController.getProjectsByEvent);

router.route('/event/:eventId/winners')
  .get(projectController.getEventWinners);

router.route('/event/:eventId/certificates')
  .get(projectController.generateProjectCertificates);

router.route('/certificates/send')
  .post(restrictTo('admin'), projectController.sendCertificateEmails);

router.route('/team/:teamId')
  .get(projectController.getProjectsByTeam);

router.route('/:id')
  .get(projectController.getProject)
  .patch(projectController.updateProject)
  .delete(restrictTo('admin'), projectController.deleteProject);

router.route('/:id/details')
  .get(projectController.getProjectWithDetails);

router.route('/:id/department-evaluation')
  .post(restrictTo('jury'), projectController.evaluateProjectByDepartment);

router.route('/:id/central-evaluation')
  .post(restrictTo('jury'), projectController.evaluateProjectByCentral);

export default router;
