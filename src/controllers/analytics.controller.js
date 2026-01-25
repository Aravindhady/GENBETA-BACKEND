import FormSubmission from "../models/FormSubmission.model.js";
import Form from "../models/Form.model.js";
import Plant from "../models/Plant.model.js";
import User from "../models/User.model.js";
import Company from "../models/Company.model.js";
import { sendResponse } from "../utils/response.js";
import dayjs from "dayjs";
import mongoose from "mongoose";

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

    let plantQuery = {};
    if (companyId) {
      plantQuery.companyId = companyId;
    }

    const plants = await Plant.find(plantQuery).lean();

    const plantStats = await Promise.all(
      plants.map(async (plant) => {
        const users = await User.find({ plantId: plant._id }).select("_id");
        const userIds = users.map(u => u._id);

        const [total, pending, approved, rejected] = await Promise.all([
          FormSubmission.countDocuments({ submittedBy: { $in: userIds } }),
          FormSubmission.countDocuments({ submittedBy: { $in: userIds }, status: "pending" }),
          FormSubmission.countDocuments({ submittedBy: { $in: userIds }, status: "approved" }),
          FormSubmission.countDocuments({ submittedBy: { $in: userIds }, status: "rejected" })
        ]);

        // Calculate average approval time for this plant
        const processedSubs = await FormSubmission.find({
          submittedBy: { $in: userIds },
          status: { $in: ["approved", "rejected"] }
        }).select("submittedAt approvedAt rejectedAt").lean();

        const approvalTimes = processedSubs
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
            plantCode: plant.plantCode,
            location: plant.location,
          stats: {
            total,
            pending,
            approved,
            rejected,
            avgApprovalTime: parseFloat(avgApprovalTime)
          }
        };
      })
    );

    sendResponse(res, 200, "Plant-wise statistics retrieved", plantStats);
  } catch (error) {
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
        
        if (filterPlantId) {
          const users = await User.find({ plantId: filterPlantId }).select("_id");
          query.submittedBy = { $in: users.map(u => u._id) };
        } else if (filterCompanyId) {
          const users = await User.find({ companyId: filterCompanyId }).select("_id");
          query.submittedBy = { $in: users.map(u => u._id) };
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
        
        if (filterPlantId) {
          const users = await User.find({ plantId: filterPlantId }).select("_id");
          query.submittedBy = { $in: users.map(u => u._id) };
        } else if (filterCompanyId) {
          const users = await User.find({ companyId: filterCompanyId }).select("_id");
          query.submittedBy = { $in: users.map(u => u._id) };
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
        
        if (filterPlantId) {
          const users = await User.find({ plantId: filterPlantId }).select("_id");
          query.submittedBy = { $in: users.map(u => u._id) };
        } else if (filterCompanyId) {
          const users = await User.find({ companyId: filterCompanyId }).select("_id");
          query.submittedBy = { $in: users.map(u => u._id) };
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
        if (filterPlantId) {
          const users = await User.find({ plantId: filterPlantId }).select("_id");
          query.submittedBy = { $in: users.map(u => u._id) };
        } else if (filterCompanyId) {
          const users = await User.find({ companyId: filterCompanyId }).select("_id");
          query.submittedBy = { $in: users.map(u => u._id) };
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
        return Promise.all(
          plants.map(async (plant) => {
            const users = await User.find({ plantId: plant._id }).select("_id");
            const userIds = users.map(u => u._id);

            const [total, pending, approved, rejected] = await Promise.all([
              FormSubmission.countDocuments({ submittedBy: { $in: userIds } }),
              FormSubmission.countDocuments({ submittedBy: { $in: userIds }, status: "pending" }),
              FormSubmission.countDocuments({ submittedBy: { $in: userIds }, status: "approved" }),
              FormSubmission.countDocuments({ submittedBy: { $in: userIds }, status: "rejected" })
            ]);

              return {
                plantId: plant._id,
                plantName: plant.name,
                plantCode: plant.plantCode,
                location: plant.location,
                stats: { total, pending, approved, rejected }
              };
          })
        );
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
    const { days = 30, companyId, plantId } = req.query;
    const { start, end } = getDateRange(parseInt(days));

    // Base filters
    let submissionFilter = { submittedAt: { $gte: start, $lte: end } };
    let companyFilter = {};
    let plantFilter = {};
    let formFilter = { createdAt: { $gte: start, $lte: end } };

    if (companyId) {
      submissionFilter.companyId = new mongoose.Types.ObjectId(companyId);
      plantFilter.companyId = new mongoose.Types.ObjectId(companyId);
      formFilter.companyId = new mongoose.Types.ObjectId(companyId);
    }
    if (plantId) {
      submissionFilter.plantId = new mongoose.Types.ObjectId(plantId);
      formFilter.plantId = new mongoose.Types.ObjectId(plantId);
    }

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
      FormSubmission.countDocuments({ ...submissionFilter, status: "approved" }),
      FormSubmission.countDocuments({ ...submissionFilter, status: "rejected" }),
      FormSubmission.countDocuments({ ...submissionFilter, status: "pending" }),
      // Company breakdown for table
      (async () => {
        const companies = await Company.find().lean();
        return Promise.all(companies.map(async (comp) => {
          const plantsCount = await Plant.countDocuments({ companyId: comp._id });
          const formsCount = await Form.countDocuments({ companyId: comp._id });
          const subs = await FormSubmission.find({ companyId: comp._id }).select("status").lean();
          
          const total = subs.length;
          const approved = subs.filter(s => s.status === "approved").length;
          const rejected = subs.filter(s => s.status === "rejected").length;
          const pending = subs.filter(s => s.status === "pending").length;

          return {
            companyId: comp._id,
            companyName: comp.name,
            plantsCount,
            formsCount,
            submissionsCount: total,
            approvedPercent: total > 0 ? parseFloat(((approved / total) * 100).toFixed(1)) : 0,
            pendingPercent: total > 0 ? parseFloat(((pending / total) * 100).toFixed(1)) : 0,
            rejectedPercent: total > 0 ? parseFloat(((rejected / total) * 100).toFixed(1)) : 0
          };
        }));
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
    sendResponse(res, 500, "Error fetching Super Admin analytics", null, error.message);
  }
};

