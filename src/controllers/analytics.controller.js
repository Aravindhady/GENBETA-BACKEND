import FormSubmission from "../models/FormSubmission.model.js";
import Form from "../models/Form.model.js";
import Plant from "../models/Plant.model.js";
import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import { sendResponse } from "../utils/response.js";
import dayjs from "dayjs";
import mongoose from "mongoose";
import { generateCacheKey, getFromCache, setInCache } from "../utils/cache.js";

// Helper function to calculate days between dates
const calculateDays = (startDate, endDate) => {
  if (!startDate || !endDate) return null;
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  return end.diff(start, "day", true); // Returns decimal days
};

// Helper function to get date range
const getDateRange = (days = 30) => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start, end };
};

// Get approvals count by employee
export const getApprovalsByEmployee = async (req, res) => {
  try {
    const { days = 30, plantId, companyId } = req.query;
    const { start, end } = getDateRange(parseInt(days));

    const aggregation = [
      {
        $match: {
          "approvalHistory.status": "APPROVED",
          "approvalHistory.actionedAt": { $gte: start, $lte: end }
        }
      }
    ];

    if (plantId) {
      aggregation[0].$match.plantId = new mongoose.Types.ObjectId(plantId);
    }
    if (companyId) {
      aggregation[0].$match.companyId = new mongoose.Types.ObjectId(companyId);
    }

    aggregation.push(
      { $unwind: "$approvalHistory" },
      {
        $match: {
          "approvalHistory.status": "APPROVED",
          "approvalHistory.actionedAt": { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: "$approvalHistory.approverId",
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "employee"
        }
      },
      { $unwind: "$employee" },
        {
          $project: {
            _id: 1,
            count: 1,
            employeeName: "$employee.name",
            employeeEmail: "$employee.email"
          }
        },
      { $sort: { count: -1 } }
    );

    const results = await FormSubmission.aggregate(aggregation);

    sendResponse(res, 200, "Approvals by employee retrieved", results);
  } catch (error) {
    sendResponse(res, 500, "Error fetching approvals by employee", null, error.message);
  }
};

// Get approver performance metrics
export const getApproversPerformance = async (req, res) => {
  try {
    const { days = 30, plantId, companyId } = req.query;
    const { start, end } = getDateRange(parseInt(days));

    // Generate cache key
    const cacheKey = generateCacheKey('approvers-performance', { 
      days, 
      plantId: plantId || 'all', 
      companyId: companyId || 'all' 
    });
    
    // Try to get from cache first
    let cachedResult = await getFromCache(cacheKey);
    if (cachedResult) {
      return sendResponse(res, 200, "Approvers performance retrieved", cachedResult);
    }

    // Base aggregation pipeline for approver performance
    const aggregation = [
      {
        $match: {
          "approvalHistory": { $exists: true, $ne: [] },
          "approvalHistory.actionedAt": { $gte: start, $lte: end }
        }
      }
    ];

    if (plantId) {
      aggregation[0].$match.plantId = new mongoose.Types.ObjectId(plantId);
    }
    if (companyId) {
      aggregation[0].$match.companyId = new mongoose.Types.ObjectId(companyId);
    }

    aggregation.push(
      { $unwind: "$approvalHistory" },
      {
        $match: {
          "approvalHistory.actionedAt": { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: "$approvalHistory.approverId",
          totalActions: { $sum: 1 },
          approvedCount: { $sum: { $cond: [{ $eq: ["$approvalHistory.status", "APPROVED"] }, 1, 0] } },
          rejectedCount: { $sum: { $cond: [{ $eq: ["$approvalHistory.status", "REJECTED"] }, 1, 0] } },
          avgTimeToAction: { $avg: { $subtract: ["$approvalHistory.actionedAt", "$createdAt"] } },
          latestAction: { $max: "$approvalHistory.actionedAt" }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "approver"
        }
      },
      { $unwind: "$approver" },
      {
        $project: {
          _id: 1,
          approverName: "$approver.name",
          approverEmail: "$approver.email",
          totalActions: 1,
          approvedCount: 1,
          rejectedCount: 1,
          approvalRate: {
            $cond: {
              if: { $eq: ["$totalActions", 0] },
              then: 0,
              else: { $multiply: [{ $divide: ["$approvedCount", "$totalActions"] }, 100] }
            }
          },
          avgTimeToAction: { $divide: ["$avgTimeToAction", 1000 * 60 * 60] }, // Convert to hours
          latestAction: 1
        }
      },
      { $sort: { totalActions: -1 } }
    );

    const results = await FormSubmission.aggregate(aggregation);

    // Cache the result for 10 minutes
    await setInCache(cacheKey, results, 600);

    sendResponse(res, 200, "Approvers performance retrieved", results);
  } catch (error) {
    sendResponse(res, 500, "Error fetching approvers performance", null, error.message);
  }
};

// Get approver workload distribution
export const getApproversWorkload = async (req, res) => {
  try {
    const { plantId, companyId } = req.query;

    // Generate cache key
    const cacheKey = generateCacheKey('approvers-workload', { 
      plantId: plantId || 'all', 
      companyId: companyId || 'all' 
    });
    
    // Try to get from cache first
    let cachedResult = await getFromCache(cacheKey);
    if (cachedResult) {
      return sendResponse(res, 200, "Approvers workload retrieved", cachedResult);
    }

    // Get all forms with approval flows
    const formFilter = {};
    if (plantId) formFilter.plantId = plantId;
    if (companyId) formFilter.companyId = companyId;
    
    const forms = await Form.find(formFilter).select("approvalFlow").lean();
    
    // Extract all approvers from all forms
    const allApprovers = [];
    forms.forEach(form => {
      if (form.approvalFlow && Array.isArray(form.approvalFlow)) {
        form.approvalFlow.forEach(level => {
          if (level.approverId) {
            const approverId = level.approverId._id || level.approverId;
            allApprovers.push(approverId);
          }
        });
      }
    });
    
    // Remove duplicates
    const uniqueApproverIds = [...new Set(allApprovers)];
    
    // Get pending submissions for each approver
    const workloadResults = [];
    
    for (const approverId of uniqueApproverIds) {
      // Count submissions where this approver is in the approval flow and it's their turn
      const count = await FormSubmission.aggregate([
        {
          $lookup: {
            from: "forms",
            localField: "templateId",
            foreignField: "_id",
            as: "form"
          }
        },
        { $unwind: "$form" },
        {
          $match: {
            "form.approvalFlow.approverId": new mongoose.Types.ObjectId(approverId),
            status: { $in: ["PENDING_APPROVAL", "IN_PROGRESS", "in_progress", "SUBMITTED"] },
            $expr: {
              $and: [
                { $eq: ["$currentLevel", {
                  $arrayElemAt: [
                    "$form.approvalFlow.level",
                    { $indexOfArray: ["$form.approvalFlow.approverId", new mongoose.Types.ObjectId(approverId)] }
                  ]
                }]},
                { $ne: ["$currentLevel", null] }
              ]
            }
          }
        }
      ]).then(result => result.length || 0);
      
      // Get approver details
      const approver = await User.findById(approverId).select("name email").lean();
      
      workloadResults.push({
        approverId,
        approverName: approver?.name || "Unknown Approver",
        approverEmail: approver?.email || "N/A",
        pendingCount: count
      });
    }

    // Sort by pending count descending
    workloadResults.sort((a, b) => b.pendingCount - a.pendingCount);

    // Cache the result for 5 minutes
    await setInCache(cacheKey, workloadResults, 300);

    sendResponse(res, 200, "Approvers workload retrieved", workloadResults);
  } catch (error) {
    console.error('Error in getApproversWorkload:', error);
    sendResponse(res, 500, "Error fetching approvers workload", null, error.message);
  }
};

// Get submissions per day
export const getSubmissionsPerDay = async (req, res) => {
  try {
    const { days = 30, plantId, companyId } = req.query;
    const { start, end } = getDateRange(parseInt(days));

    // Build query
    let query = {
      submittedAt: { $gte: start, $lte: end }
    };

    // Filter by plant if provided
    if (plantId) {
      const users = await User.find({ plantId }).select("_id");
      query.submittedBy = { $in: users.map(u => u._id) };
    }

    // Filter by company if provided
    if (companyId) {
      const users = await User.find({ companyId }).select("_id");
      query.submittedBy = { $in: users.map(u => u._id) };
    }

    const submissions = await FormSubmission.find(query)
      .select("submittedAt")
      .lean();

    // Group by day
    const dailyData = {};
    submissions.forEach(sub => {
      const date = dayjs(sub.submittedAt).format("YYYY-MM-DD");
      dailyData[date] = (dailyData[date] || 0) + 1;
    });

    // Format for chart
    const chartData = Object.keys(dailyData)
      .sort()
      .map(date => ({
        date,
        count: dailyData[date]
      }));

    sendResponse(res, 200, "Submissions per day retrieved", {
      data: chartData,
      total: submissions.length,
      period: { start, end }
    });
  } catch (error) {
    sendResponse(res, 500, "Error fetching submissions per day", null, error.message);
  }
};

// Get average approval time
export const getAverageApprovalTime = async (req, res) => {
  try {
    const { days = 30, plantId, companyId } = req.query;
    const { start, end } = getDateRange(parseInt(days));

    let query = {
      status: { $in: ["approved", "rejected"] },
      submittedAt: { $gte: start, $lte: end }
    };

    if (plantId) {
      const users = await User.find({ plantId }).select("_id");
      query.submittedBy = { $in: users.map(u => u._id) };
    }

    if (companyId) {
      const users = await User.find({ companyId }).select("_id");
      query.submittedBy = { $in: users.map(u => u._id) };
    }

    const submissions = await FormSubmission.find(query)
      .select("submittedAt approvedAt rejectedAt status")
      .lean();

    const approvalTimes = [];
    submissions.forEach(sub => {
      const endDate = sub.approvedAt || sub.rejectedAt;
      if (endDate) {
        const days = calculateDays(sub.submittedAt, endDate);
        if (days !== null) {
          approvalTimes.push(days);
        }
      }
    });

    const average = approvalTimes.length > 0
      ? approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length
      : 0;

    sendResponse(res, 200, "Average approval time retrieved", {
      averageDays: parseFloat(average.toFixed(2)),
      totalProcessed: approvalTimes.length,
      minDays: approvalTimes.length > 0 ? Math.min(...approvalTimes).toFixed(2) : 0,
      maxDays: approvalTimes.length > 0 ? Math.max(...approvalTimes).toFixed(2) : 0
    });
  } catch (error) {
    sendResponse(res, 500, "Error calculating average approval time", null, error.message);
  }
};

// Get rejection rate
export const getRejectionRate = async (req, res) => {
  try {
    const { days = 30, plantId, companyId } = req.query;
    const { start, end } = getDateRange(parseInt(days));

    let query = {
      status: { $in: ["approved", "rejected"] },
      submittedAt: { $gte: start, $lte: end }
    };

    if (plantId) {
      const users = await User.find({ plantId }).select("_id");
      query.submittedBy = { $in: users.map(u => u._id) };
    }

    if (companyId) {
      const users = await User.find({ companyId }).select("_id");
      query.submittedBy = { $in: users.map(u => u._id) };
    }

    const [approved, rejected, total] = await Promise.all([
      FormSubmission.countDocuments({ ...query, status: "approved" }),
      FormSubmission.countDocuments({ ...query, status: "rejected" }),
      FormSubmission.countDocuments(query)
    ]);

    const rejectionRate = total > 0 ? ((rejected / total) * 100).toFixed(2) : 0;
    const approvalRate = total > 0 ? ((approved / total) * 100).toFixed(2) : 0;

    sendResponse(res, 200, "Rejection rate retrieved", {
      rejectionRate: parseFloat(rejectionRate),
      approvalRate: parseFloat(approvalRate),
      total,
      approved,
      rejected
    });
  } catch (error) {
    sendResponse(res, 500, "Error calculating rejection rate", null, error.message);
  }
};

// Get pending by stage (status)
export const getPendingByStage = async (req, res) => {
  try {
    const { plantId, companyId } = req.query;

    let query = {};

    if (plantId) {
      const users = await User.find({ plantId }).select("_id");
      query.submittedBy = { $in: users.map(u => u._id) };
    }

    if (companyId) {
      const users = await User.find({ companyId }).select("_id");
      query.submittedBy = { $in: users.map(u => u._id) };
    }

    const [pending, approved, rejected] = await Promise.all([
      FormSubmission.countDocuments({ ...query, status: "pending" }),
      FormSubmission.countDocuments({ ...query, status: "approved" }),
      FormSubmission.countDocuments({ ...query, status: "rejected" })
    ]);

    sendResponse(res, 200, "Pending by stage retrieved", {
      pending,
      approved,
      rejected,
      total: pending + approved + rejected
    });
  } catch (error) {
    sendResponse(res, 500, "Error fetching pending by stage", null, error.message);
  }
};

// Get plant-wise statistics
export const getPlantWiseStats = async (req, res) => {
  try {
    const { companyId } = req.query;
    
    // Generate cache key
    const cacheKey = generateCacheKey('plant-stats', { companyId: companyId || 'all' });
    
    // Try to get from cache first
    let cachedResult = await getFromCache(cacheKey);
    if (cachedResult) {
      return sendResponse(res, 200, "Plant-wise statistics retrieved", cachedResult);
    }

    let plantQuery = {};
    if (companyId) {
      plantQuery.companyId = companyId;
    }

    // Get all plants
    const plants = await Plant.find(plantQuery).lean();
    
    if (plants.length === 0) {
      const result = [];
      await setInCache(cacheKey, result, 300); // Cache for 5 minutes
      return sendResponse(res, 200, "Plant-wise statistics retrieved", result);
    }

    // Get all users grouped by plantId for efficient lookup
    const plantIds = plants.map(plant => plant._id);
    const users = await User.find({ plantId: { $in: plantIds } }).select("_id plantId").lean();
    
    // Create a map of plantId to user IDs
    const plantUserMap = {};
    users.forEach(user => {
      if (!plantUserMap[user.plantId]) {
        plantUserMap[user.plantId] = [];
      }
      plantUserMap[user.plantId].push(user._id);
    });

    // Pre-aggregate submission counts by plant
    const submissionAggregation = await FormSubmission.aggregate([
      { $match: { submittedBy: { $in: users.map(u => u._id) } } },
      {
        $group: {
          _id: "$plantId",
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ["$status", "PENDING_APPROVAL"] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ["$status", "APPROVED"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "REJECTED"] }, 1, 0] } },
          processedSubmissions: {
            $push: {
              submittedAt: "$submittedAt",
              approvedAt: "$approvedAt",
              rejectedAt: "$rejectedAt"
            }
          }
        }
      }
    ]);

    // Create a map of plantId to aggregated stats
    const submissionStatsMap = {};
    submissionAggregation.forEach(stat => {
      submissionStatsMap[stat._id] = stat;
    });

    // Calculate average approval time for each plant
    const plantStats = plants.map(plant => {
      const userIDs = plantUserMap[plant._id] || [];
      const stats = submissionStatsMap[plant._id] || { total: 0, pending: 0, approved: 0, rejected: 0, processedSubmissions: [] };
      
      // Calculate average approval time
      const approvalTimes = stats.processedSubmissions
        .map(sub => {
          const endDate = sub.approvedAt || sub.rejectedAt;
          return endDate ? calculateDays(sub.submittedAt, endDate) : null;
        })
        .filter(time => time !== null);

      const avgApprovalTime = approvalTimes.length > 0
        ? (approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length).toFixed(2)
        : 0;

      return {
        plantId: plant._id,
        plantName: plant.name,
        plantCode: plant.code,
        location: plant.location,
        stats: {
          total: stats.total,
          pending: stats.pending,
          approved: stats.approved,
          rejected: stats.rejected,
          avgApprovalTime: parseFloat(avgApprovalTime)
        }
      };
    });
    
    // Cache the result for 5 minutes
    await setInCache(cacheKey, plantStats, 300);

    sendResponse(res, 200, "Plant-wise statistics retrieved", plantStats);
  } catch (error) {
    console.error('Error in getPlantWiseStats:', error);
    sendResponse(res, 500, "Error fetching plant-wise stats", null, error.message);
  }
};

// Get comprehensive dashboard analytics
export const getDashboardAnalytics = async (req, res) => {
  try {
    const { days = 30, plantId, companyId } = req.query;
    const user = req.user;

    // Determine filter based on user role
    let filterPlantId = plantId;
    let filterCompanyId = companyId;

    if (user.role === "PLANT_ADMIN" && user.plantId) {
      filterPlantId = user.plantId.toString();
    } else if (user.role === "COMPANY_ADMIN" && user.companyId) {
      filterCompanyId = user.companyId.toString();
    }

    // Fetch all analytics in parallel
    const [submissionsPerDay, avgApprovalTime, rejectionRate, pendingByStage, plantStats, approvalsByEmployee] = await Promise.all([
      // Submissions per day
      (async () => {
        const { start, end } = getDateRange(parseInt(days));
        let query = { submittedAt: { $gte: start, $lte: end } };
        
        // Get users once if needed
        let userIds = [];
        if (filterPlantId) {
          const users = await User.find({ plantId: filterPlantId }).select("_id").lean();
          userIds = users.map(u => u._id);
          query.submittedBy = { $in: userIds };
        } else if (filterCompanyId) {
          const users = await User.find({ companyId: filterCompanyId }).select("_id").lean();
          userIds = users.map(u => u._id);
          query.submittedBy = { $in: userIds };
        }

        const submissions = await FormSubmission.find(query).select("submittedAt").lean();
        const dailyData = {};
        submissions.forEach(sub => {
          const date = dayjs(sub.submittedAt).format("YYYY-MM-DD");
          dailyData[date] = (dailyData[date] || 0) + 1;
        });
        return Object.keys(dailyData).sort().map(date => ({ date, count: dailyData[date] }));
      })(),
      
      // Average approval time
      (async () => {
        const { start, end } = getDateRange(parseInt(days));
        let query = {
          status: { $in: ["approved", "rejected"] },
          submittedAt: { $gte: start, $lte: end }
        };
        
        // Get users again for this query
        let userIds = [];
        if (filterPlantId) {
          const users = await User.find({ plantId: filterPlantId }).select("_id").lean();
          userIds = users.map(u => u._id);
          query.submittedBy = { $in: userIds };
        } else if (filterCompanyId) {
          const users = await User.find({ companyId: filterCompanyId }).select("_id").lean();
          userIds = users.map(u => u._id);
          query.submittedBy = { $in: userIds };
        }

        const submissions = await FormSubmission.find(query)
          .select("submittedAt approvedAt rejectedAt")
          .lean();

        const approvalTimes = submissions
          .map(sub => {
            const endDate = sub.approvedAt || sub.rejectedAt;
            return endDate ? calculateDays(sub.submittedAt, endDate) : null;
          })
          .filter(time => time !== null);

        return approvalTimes.length > 0
          ? (approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length).toFixed(2)
          : 0;
      })(),
      
      // Rejection rate
      (async () => {
        const { start, end } = getDateRange(parseInt(days));
        let query = {
          status: { $in: ["approved", "rejected"] },
          submittedAt: { $gte: start, $lte: end }
        };
        
        // Get users again for this query
        let userIds = [];
        if (filterPlantId) {
          const users = await User.find({ plantId: filterPlantId }).select("_id").lean();
          userIds = users.map(u => u._id);
          query.submittedBy = { $in: userIds };
        } else if (filterCompanyId) {
          const users = await User.find({ companyId: filterCompanyId }).select("_id").lean();
          userIds = users.map(u => u._id);
          query.submittedBy = { $in: userIds };
        }

        const [approved, rejected, total] = await Promise.all([
          FormSubmission.countDocuments({ ...query, status: "approved" }),
          FormSubmission.countDocuments({ ...query, status: "rejected" }),
          FormSubmission.countDocuments(query)
        ]);

        return {
          rejectionRate: total > 0 ? parseFloat(((rejected / total) * 100).toFixed(2)) : 0,
          approvalRate: total > 0 ? parseFloat(((approved / total) * 100).toFixed(2)) : 0,
          total,
          approved,
          rejected
        };
      })(),
      
      // Pending by stage
      (async () => {
        let query = {};
        // Get users again for this query
        let userIds = [];
        if (filterPlantId) {
          const users = await User.find({ plantId: filterPlantId }).select("_id").lean();
          userIds = users.map(u => u._id);
          query.submittedBy = { $in: userIds };
        } else if (filterCompanyId) {
          const users = await User.find({ companyId: filterCompanyId }).select("_id").lean();
          userIds = users.map(u => u._id);
          query.submittedBy = { $in: userIds };
        }

        const [pending, approved, rejected] = await Promise.all([
          FormSubmission.countDocuments({ ...query, status: "pending" }),
          FormSubmission.countDocuments({ ...query, status: "approved" }),
          FormSubmission.countDocuments({ ...query, status: "rejected" })
        ]);

        return { pending, approved, rejected, total: pending + approved + rejected };
      })(),
      
      // Plant-wise stats (only if not filtered by plant)
      (async () => {
        if (filterPlantId) return []; // Don't show plant breakdown if viewing single plant
        
        let plantQuery = {};
        if (filterCompanyId) {
          plantQuery.companyId = filterCompanyId;
        }

        const plants = await Plant.find(plantQuery).lean();
        
        if (plants.length === 0) {
          return [];
        }
        
        // Get all users for the plants
        const plantIds = plants.map(plant => plant._id);
        const users = await User.find({ plantId: { $in: plantIds } }).select("_id plantId").lean();
        
        // Create a map of plantId to user IDs
        const plantUserMap = {};
        users.forEach(user => {
          if (!plantUserMap[user.plantId]) {
            plantUserMap[user.plantId] = [];
          }
          plantUserMap[user.plantId].push(user._id);
        });

        // Pre-aggregate submission counts by plant
        const submissionAggregation = await FormSubmission.aggregate([
          { $match: { submittedBy: { $in: users.map(u => u._id) } } },
          {
            $group: {
              _id: "$plantId",
              total: { $sum: 1 },
              pending: { $sum: { $cond: [{ $eq: ["$status", "PENDING_APPROVAL"] }, 1, 0] } },
              approved: { $sum: { $cond: [{ $eq: ["$status", "APPROVED"] }, 1, 0] } },
              rejected: { $sum: { $cond: [{ $eq: ["$status", "REJECTED"] }, 1, 0] } }
            }
          }
        ]);

        // Create a map of plantId to aggregated stats
        const submissionStatsMap = {};
        submissionAggregation.forEach(stat => {
          submissionStatsMap[stat._id] = stat;
        });

        // Build the plant stats
        return plants.map(plant => {
          const userIDs = plantUserMap[plant._id] || [];
          const stats = submissionStatsMap[plant._id] || { total: 0, pending: 0, approved: 0, rejected: 0 };
          
          return {
            plantId: plant._id,
            plantName: plant.name,
            plantCode: plant.code,
            location: plant.location,
            stats: { 
              total: stats.total, 
              pending: stats.pending, 
              approved: stats.approved, 
              rejected: stats.rejected 
            }
          };
        });
      })(),

      // Approvals by employee
      (async () => {
        const { start, end } = getDateRange(parseInt(days));
        const aggregation = [
          {
            $match: {
              "approvalHistory.status": "APPROVED",
              "approvalHistory.actionedAt": { $gte: start, $lte: end }
            }
          }
        ];

        if (filterPlantId) {
          aggregation[0].$match.plantId = new mongoose.Types.ObjectId(filterPlantId);
        } else if (filterCompanyId) {
          aggregation[0].$match.companyId = new mongoose.Types.ObjectId(filterCompanyId);
        }

        aggregation.push(
          { $unwind: "$approvalHistory" },
          {
            $match: {
              "approvalHistory.status": "APPROVED",
              "approvalHistory.actionedAt": { $gte: start, $lte: end }
            }
          },
          {
            $group: {
              _id: "$approvalHistory.approverId",
              count: { $sum: 1 }
            }
          },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "employee"
            }
          },
          { $unwind: "$employee" },
          {
            $project: {
              label: "$employee.name",
              value: "$count"
            }
          },
          { $sort: { value: -1 } }
        );

        return await FormSubmission.aggregate(aggregation);
      })()
    ]);

    sendResponse(res, 200, "Dashboard analytics retrieved", {
      submissionsPerDay,
      averageApprovalTime: parseFloat(avgApprovalTime),
      rejectionRate,
      pendingByStage,
      plantWiseStats: plantStats,
      approvalsByEmployee,
      period: days
    });
  } catch (error) {
    sendResponse(res, 500, "Error fetching dashboard analytics", null, error.message);
  }
};

// Get Super Admin specific analytics
export const getSuperAdminAnalytics = async (req, res) => {
  try {
    console.log('getSuperAdminAnalytics called with query:', req.query);
    const { days = 30, companyId, plantId } = req.query;
    const { start, end } = getDateRange(parseInt(days));
    console.log('Date range calculated:', start, 'to', end);

    // Base filters
    let submissionFilter = { submittedAt: { $gte: start, $lte: end } };
    let companyFilter = {};
    let plantFilter = {};
    let formFilter = { createdAt: { $gte: start, $lte: end } };

    if (companyId) {
      console.log('Applying company filter:', companyId);
      submissionFilter.companyId = new mongoose.Types.ObjectId(companyId);
      plantFilter.companyId = new mongoose.Types.ObjectId(companyId);
      formFilter.companyId = new mongoose.Types.ObjectId(companyId);
    }
    if (plantId) {
      console.log('Applying plant filter:', plantId);
      submissionFilter.plantId = new mongoose.Types.ObjectId(plantId);
      formFilter.plantId = new mongoose.Types.ObjectId(plantId);
    }
    console.log('Filters prepared:', { submissionFilter, companyFilter, plantFilter, formFilter });

    const [
      totalCompanies,
      totalPlants,
      totalForms,
      totalSubmissions,
      approvedCount,
      rejectedCount,
      pendingCount,
      companyBreakdown,
      submissionsOverTime
    ] = await Promise.all([
      Company.countDocuments(companyFilter),
      Plant.countDocuments(plantFilter),
      Form.countDocuments(formFilter),
      FormSubmission.countDocuments(submissionFilter),
      FormSubmission.countDocuments({ ...submissionFilter, status: "APPROVED" }),
      FormSubmission.countDocuments({ ...submissionFilter, status: "REJECTED" }),
      FormSubmission.countDocuments({ ...submissionFilter, status: "PENDING_APPROVAL" }),
      // Company breakdown for table
      (async () => {
        const companies = await Company.find().lean();
        
        if (companies.length === 0) {
          return [];
        }
        
        // Pre-aggregate data for all companies
        const plantCounts = await Plant.aggregate([
          { $group: { _id: "$companyId", count: { $sum: 1 } } }
        ]);
        
        const formCounts = await Form.aggregate([
          { $group: { _id: "$companyId", count: { $sum: 1 } } }
        ]);
        
        const submissionCounts = await FormSubmission.aggregate([
          { $group: {
            _id: "$companyId",
            total: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ["$status", "APPROVED"] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ["$status", "REJECTED"] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ["$status", "PENDING_APPROVAL"] }, 1, 0] } }
          }}
        ]);
        
        // Create maps for quick lookup
        const plantCountMap = {};
        plantCounts.forEach(item => {
          if (item._id) {  // Skip null/undefined IDs
            plantCountMap[item._id.toString()] = item.count;
          }
        });
        
        const formCountMap = {};
        formCounts.forEach(item => {
          if (item._id) {  // Skip null/undefined IDs
            formCountMap[item._id.toString()] = item.count;
          }
        });
        
        const submissionCountMap = {};
        submissionCounts.forEach(item => {
          if (item._id) {  // Skip null/undefined IDs
            submissionCountMap[item._id.toString()] = item;
          }
        });
        
        return companies.map(comp => {
          // Skip companies with null/undefined IDs
          if (!comp._id) {
            return null;
          }
          
          const compIdStr = comp._id.toString();
          const plantsCount = plantCountMap[compIdStr] || 0;
          const formsCount = formCountMap[compIdStr] || 0;
          const subs = submissionCountMap[compIdStr] || { total: 0, approved: 0, rejected: 0, pending: 0 };
          
          const total = subs.total;
          
          return {
            companyId: comp._id,
            companyName: comp.name,
            plantsCount,
            formsCount,
            submissionsCount: total,
            approvedPercent: total > 0 ? parseFloat(((subs.approved / total) * 100).toFixed(1)) : 0,
            pendingPercent: total > 0 ? parseFloat(((subs.pending / total) * 100).toFixed(1)) : 0,
            rejectedPercent: total > 0 ? parseFloat(((subs.rejected / total) * 100).toFixed(1)) : 0
          };
        }).filter(Boolean); // Remove any null entries
      })(),
      // Submissions over time
      (async () => {
        const submissions = await FormSubmission.find(submissionFilter).select("submittedAt").lean();
        const dailyData = {};
        submissions.forEach(sub => {
          const date = dayjs(sub.submittedAt).format("YYYY-MM-DD");
          dailyData[date] = (dailyData[date] || 0) + 1;
        });
        
        // Ensure we have data for the range
        const data = [];
        for (let i = parseInt(days); i >= 0; i--) {
          const d = dayjs().subtract(i, "day").format("YYYY-MM-DD");
          data.push({
            date: d,
            count: dailyData[d] || 0
          });
        }
        return data;
      })()
    ]);

    sendResponse(res, 200, "Super Admin analytics retrieved", {
      kpi: {
        totalCompanies,
        totalPlants,
        totalForms,
        totalSubmissions,
        totalApproved: approvedCount,
        totalRejected: rejectedCount,
        totalPending: pendingCount,
        activeUsersToday: 0, // Placeholder
        activeUsersMonth: 0  // Placeholder
      },
      companyTable: companyBreakdown,
      charts: {
        submissionsOverTime,
        statusBreakdown: [
          { name: "Approved", value: approvedCount },
          { name: "Pending", value: pendingCount },
          { name: "Rejected", value: rejectedCount }
        ],
        companyUsage: companyBreakdown.map(c => ({
          name: c.companyName,
          forms: c.formsCount,
          submissions: c.submissionsCount
        }))
      }
    });
  } catch (error) {
    console.error('Error in getSuperAdminAnalytics:', error);
    console.error('Error stack:', error.stack);
    sendResponse(res, 500, "Error fetching Super Admin analytics", null, error.message);
  }
};

