import nodemailer from "nodemailer";
import dotenv from "dotenv";
import Company from "../models/Company.model.js";
import Plant from "../models/Plant.model.js";

dotenv.config();

const createTransporter = () => {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_PORT == 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
  
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const transporter = createTransporter();

/**
 * Resolve the appropriate sender email based on context
 * Implements hierarchical email sending: Super Admin → Company → Plant → Employee
 */
const resolveEmailSender = async ({ actor, companyId, plantId, fallbackFrom = '"GenBeta" <no-reply@genbeta.com>' }) => {
  try {
    // Super Admin level - use platform identity
    if (actor === "SUPER_ADMIN") {
      return process.env.PLATFORM_EMAIL || '"GenBeta Platform" <no-reply@genbeta.com>';
    }
    
    // Company Admin level - use company email if available
    if (actor === "COMPANY_ADMIN" && companyId) {
      const company = await Company.findById(companyId).select("email name");
      if (company && company.email) {
        return `"${company.name} Admin" <${company.email}>`;
      }
    }
    
    // Plant Admin level - use plant email, fallback to company email
    if ((actor === "PLANT_ADMIN" || actor === "EMPLOYEE") && plantId) {
      const plant = await Plant.findById(plantId).populate("companyId", "email name").select("email name");
      if (plant) {
        // Prefer plant-specific email, then company email, then fallback
        const fromEmail = plant.email || plant.companyId?.email || process.env.PLATFORM_EMAIL || "no-reply@genbeta.com";
        const fromName = plant.name || plant.companyId?.name || "GenBeta";
        return `"${fromName}" <${fromEmail}>`;
      }
    }
    
    // Fallback to default
    return fallbackFrom;
  } catch (error) {
    console.error("Error resolving email sender:", error);
    return fallbackFrom;
  }
};

/**
 * Generates a base layout for emails with company and plant details
 */
const getBaseLayout = (content, company = {}, plant = {}) => {
  const logoHtml = company.logoUrl 
    ? `<img src="${company.logoUrl}" alt="${company.name}" style="max-height: 60px; margin-bottom: 20px;">` 
    : `<h1 style="color: #4f46e5; margin: 0;">${company.name || 'GenBeta'}</h1>`;

  const plantInfoHtml = (plant && plant.name) 
    ? `<div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #4f46e5; margin-bottom: 20px; border-radius: 0 4px 4px 0;">
         <p style="margin: 0; color: #475569; font-size: 14px;"><strong>Plant:</strong> ${plant.name} ${plant.plantNumber ? `(${plant.plantNumber})` : ''}</p>
         ${plant.location ? `<p style="margin: 0; color: #475569; font-size: 14px;"><strong>Location:</strong> ${plant.location}</p>` : ''}
       </div>`
    : '';

  const companyFooterHtml = `
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
      <p style="margin: 2px 0;"><strong>${company.name || 'GenBeta'}</strong></p>
      ${company.address ? `<p style="margin: 2px 0;">${company.address}</p>` : ''}
      ${company.gstNumber ? `<p style="margin: 2px 0;">GST: ${company.gstNumber}</p>` : ''}
    </div>
  `;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; color: #334155;">
      <div style="text-align: center; margin-bottom: 20px;">
        ${logoHtml}
      </div>
      ${plantInfoHtml}
      ${content}
      ${companyFooterHtml}
      <p style="margin-top: 20px; font-size: 11px; color: #94a3b8; text-align: center;">
        This is an automated notification. Please do not reply to this email.
      </p>
    </div>
  `;
};

export const sendApprovalEmail = async (to, formName, link, company = {}, plant = {}, actor = "PLANT_ADMIN", companyId = null, plantId = null) => {
  const content = `
    <h2 style="color: #4f46e5;">Form Approval Request</h2>
    <p>You have been requested to fill out and approve the following form:</p>
    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <strong style="font-size: 18px;">${formName}</strong>
    </div>
    <p>Please click the button below to open the form and submit your data. This link will expire in 48 hours.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${link}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Open Approval Form</a>
    </div>
    <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">If you were not expecting this email, please ignore it.</p>
  `;

  // Extract form ID from formName if it exists
  const formIdMatch = formName.match(/(\w+-\w+-\d{4}-\w+)/);
  const formId = formIdMatch ? formIdMatch[1] : 'FORM-ID';
  
  // Determine the appropriate sender based on context
  const fromAddress = await resolveEmailSender({
    actor,
    companyId,
    plantId,
    fallbackFrom: `"GenBeta" <${process.env.EMAIL_USER || process.env.SMTP_FROM || 'no-reply@genbeta.com'}>`
  });

  const mailOptions = {
    from: fromAddress,
    to,
    subject: `[Approval Required] ${formId} – ${formName} | Level 1 Approval`,
    html: getBaseLayout(content, company, plant)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Email sending failed, logging to console instead:");
    console.log("-----------------------------------------");
    console.log(`TO: ${to}`);
    console.log(`SUBJECT: ${mailOptions.subject}`);
    console.log(`LINK: ${link}`);
    console.log("-----------------------------------------");
    return { messageId: "mock-id", skipped: true };
  }
};

export const sendWelcomeEmail = async (to, name, role, companyName, loginUrl, password, company = {}, plant = {}, actor = "SYSTEM", companyId = null, plantId = null) => {
  let roleLabel = "";
  switch(role) {
    case "COMPANY_ADMIN":
      roleLabel = "Company Administrator";
      break;
    case "PLANT_ADMIN":
      roleLabel = "Plant Administrator";
      break;
    case "EMPLOYEE":
      roleLabel = "Employee";
      break;
    default:
      roleLabel = "User";
  }
  
  const content = `
    <h2 style="color: #1f2937;">Hello ${name}!</h2>
    
    <p style="color: #4b5563; line-height: 1.6;">
      Your account has been successfully created as an <strong>${roleLabel}</strong> for <strong>${companyName}</strong>.
    </p>
    
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; border-radius: 10px; margin: 25px 0; color: white;">
      <h3 style="margin: 0 0 15px 0; color: white;">Your Login Credentials</h3>
      <p style="margin: 5px 0;"><strong>Email:</strong> ${to}</p>
      <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
      <p style="margin-top: 15px; font-size: 12px; opacity: 0.9;">Please change your password after first login for security.</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${loginUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Login to Your Account</a>
    </div>
    
    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 20px;">
      <h4 style="color: #374151; margin: 0 0 10px 0;">What you can do:</h4>
      <ul style="color: #6b7280; margin: 0; padding-left: 20px;">
        ${role === "COMPANY_ADMIN" ? `
          <li>Manage multiple plants</li>
          <li>Create and assign forms</li>
          <li>View company-wide analytics</li>
          <li>Manage plant administrators</li>
        ` : role === "PLANT_ADMIN" ? `
          <li>Manage your plant operations</li>
          <li>Create and publish forms</li>
          <li>Track form submissions</li>
          <li>Manage employees</li>
        ` : `
          <li>View assigned forms</li>
          <li>Submit form responses</li>
          <li>Track your submissions</li>
          <li>Access plant resources</li>
        `}
      </ul>
    </div>
    
    <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
      If you did not expect this email, please contact your system administrator.
    </p>
  `;

  // Determine the appropriate sender based on context
  const fromAddress = await resolveEmailSender({
    actor,
    companyId,
    plantId,
    fallbackFrom: `"GenBeta" <${process.env.EMAIL_USER || process.env.SMTP_FROM || 'no-reply@genbeta.com'}>`
  });

  const mailOptions = {
    from: fromAddress,
    to,
    subject: `Welcome to ${companyName} - Your Account Has Been Created`,
    html: getBaseLayout(content, company, plant)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Welcome email sent to %s: %s", to, info.messageId);
    return info;
  } catch (error) {
    console.error("Welcome email sending failed, logging to console instead:");
    console.log("-----------------------------------------");
    console.log(`TO: ${to}`);
    console.log(`NAME: ${name}`);
    console.log(`ROLE: ${roleLabel}`);
    console.log(`COMPANY: ${companyName}`);
    console.log(`PASSWORD: ${password}`);
    console.log(`LOGIN URL: ${loginUrl}`);
    console.log("-----------------------------------------");
    return { messageId: "mock-id", skipped: true };
  }
};

export const sendPlantCreatedEmail = async (to, plantName, plantCode, companyName, company = {}, plant = {}, actor = "COMPANY_ADMIN", companyId = null, plantId = null) => {
  const content = `
    <h1 style="color: #4f46e5; margin: 0 0 20px 0; text-align: center;">New Plant Created</h1>
    
    <p style="color: #4b5563; line-height: 1.6;">
      A new plant has been successfully created for <strong>${companyName}</strong>.
    </p>
    
    <div style="background-color: #ecfdf5; border: 1px solid #10b981; padding: 20px; border-radius: 10px; margin: 25px 0;">
      <h3 style="color: #065f46; margin: 0 0 15px 0;">Plant Details</h3>
      <p style="margin: 5px 0; color: #047857;"><strong>Plant Name:</strong> ${plantName}</p>
      <p style="margin: 5px 0; color: #047857;"><strong>Plant Code:</strong> ${plantCode}</p>
      ${plant.plantNumber ? `<p style="margin: 5px 0; color: #047857;"><strong>Plant Number:</strong> ${plant.plantNumber}</p>` : ''}
      ${plant.location ? `<p style="margin: 5px 0; color: #047857;"><strong>Location:</strong> ${plant.location}</p>` : ''}
    </div>
    
    <p style="color: #6b7280; font-size: 14px;">
      You can now start managing this plant from your dashboard.
    </p>
  `;

  // Determine the appropriate sender based on context
  const fromAddress = await resolveEmailSender({
    actor,
    companyId,
    plantId,
    fallbackFrom: `"GenBeta" <${process.env.EMAIL_USER || process.env.SMTP_FROM || 'no-reply@genbeta.com'}>`
  });

  const mailOptions = {
    from: fromAddress,
    to,
    subject: `New Plant Created - ${plantName}`,
    html: getBaseLayout(content, company, plant)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Plant created email sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Plant created email failed, logging to console instead:");
    console.log("-----------------------------------------");
    console.log(`TO: ${to}`);
    console.log(`PLANT: ${plantName} (${plantCode})`);
    console.log(`COMPANY: ${companyName}`);
    console.log("-----------------------------------------");
    return { messageId: "mock-id", skipped: true };
  }
};

export const sendSubmissionNotificationToApprover = async (to, formName, submitterName, submittedAt, link, previousApprovals = [], company = {}, plant = {}, plantId = "", formId = "", submissionId = "", formFields = [], submissionData = {}, actor = "PLANT_ADMIN", companyId = null, submitterEmail = null) => {
  let approvalContext = "";
  if (previousApprovals.length > 0) {
    const lastApproval = previousApprovals[previousApprovals.length - 1];
    approvalContext = `<p style="color: #4b5563; font-size: 14px; background-color: #eff6ff; padding: 10px; border-radius: 4px;">${lastApproval.name} has approved this form. Waiting for your approval.</p>`;
  }

  // Filter fields that should be included in approval email
  const approvalFields = formFields.filter(field => field.includeInApprovalEmail);
  
  // Build approval summary table
  let approvalSummaryHtml = '';
  if (approvalFields.length > 0) {
    const summaryRows = approvalFields.map(field => {
      // The FormRenderer stores data using the field.id as the key
      const fieldValue = submissionData[field.id] || 
                        submissionData[field.fieldId] || 
                        submissionData[field.label?.toLowerCase().replace(/\s+/g, '_')] || 
                        '—';
      
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #374151;">${field.label}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">${fieldValue}</td>
        </tr>
      `;
    }).join('');

    approvalSummaryHtml = `
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin: 20px 0; overflow: hidden;">
        <div style="background-color: #f3f4f6; padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
          <h4 style="margin: 0; color: #1f2937; font-size: 16px;">Selected Submission Details</h4>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          ${summaryRows}
        </table>
      </div>
    `;
  }

  const identifier = submissionId ? `${plantId}_${formId}_${formName}_${submissionId}` : `${plantId}_${formId}_${formName}`;

  const content = `
    <h2 style="color: #4f46e5;">Form Approval Request</h2>
    <p style="color: #1f2937; font-size: 16px;">
      <strong>${submitterName}</strong> submitted the form <strong>${formName}</strong> at ${new Date(submittedAt).toLocaleString()}.
    </p>
    ${approvalContext}
    ${approvalSummaryHtml}
    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <strong style="font-size: 18px;">${formName}</strong>
    </div>
    <p>Please click the button below to review and take action on this submission.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${link}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Review Submission</a>
    </div>
  `;

  // Use submitter's email as sender if provided, otherwise use resolved sender
  const fromAddress = submitterEmail 
    ? `"${submitterName}" <${submitterEmail}>`
    : await resolveEmailSender({
    actor,
    companyId,
    plantId,
    fallbackFrom: `"GenBeta" <${process.env.EMAIL_USER || process.env.SMTP_FROM || 'no-reply@genbeta.com'}>`
  });

  // Use standardized subject format for employee submission
  const mailOptions = {
    from: fromAddress,
    to,
    subject: `[Form Submitted] ${formId || 'FORM-ID'} – ${formName} | Submitted by ${submitterName}`,
    html: getBaseLayout(content, company, plant)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error("Submission notification failed:", error);
    return { messageId: "mock-id", skipped: true };
  }
};

export const sendFormCreatedApproverNotification = async (to, formName, creatorName, link, company = {}, plant = {}, actor = "PLANT_ADMIN", companyId = null, plantId = null) => {
  const content = `
    <h2 style="color: #4f46e5;">New Form Awaiting Your Approval</h2>
    <p style="color: #1f2937; font-size: 16px;">
      <strong>${creatorName}</strong> has created a new form that requires your approval.
    </p>
    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <strong style="font-size: 18px;">${formName}</strong>
    </div>
    <p>You have been assigned as an approver for this form. Please review and take action.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${link}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Review Form</a>
    </div>
    <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">If you were not expecting this email, please contact your administrator.</p>
  `;

  // Determine the appropriate sender based on context
  const fromAddress = await resolveEmailSender({
    actor,
    companyId,
    plantId,
    fallbackFrom: `"GenBeta" <${process.env.EMAIL_USER || process.env.SMTP_FROM || 'no-reply@genbeta.com'}>`
  });

  const mailOptions = {
    from: fromAddress,
    to,
    subject: `Action Required: Form Approval - ${formName}`,
    html: getBaseLayout(content, company, plant)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Form created approver notification sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Form created approver notification failed, logging to console:");
    console.log("-----------------------------------------");
    console.log(`TO: ${to}`);
    console.log(`FORM: ${formName}`);
    console.log(`CREATOR: ${creatorName}`);
    console.log(`LINK: ${link}`);
    console.log("-----------------------------------------");
    return { messageId: "mock-id", skipped: true };
  }
};

export const sendSubmissionNotificationToPlant = async (to, formName, submitterName, submittedAt, link, company = {}, plant = {}, plantId = "", formId = "", submissionId = "", actor = "EMPLOYEE", companyId = null) => {
  const identifier = submissionId ? `${plantId}_${formId}_${formName}_${submissionId}` : `${plantId}_${formId}_${formName}`;
  
  const content = `
    <h2 style="color: #4f46e5;">New Form Submission</h2>
    <p style="color: #1f2937; font-size: 16px;">
      <strong>${submitterName}</strong> has submitted a form.
    </p>
    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <strong style="font-size: 18px;">${formName}</strong>
      <p style="margin: 10px 0 0 0; font-size: 14px; color: #6b7280;">Submitted at: ${new Date(submittedAt).toLocaleString()}</p>
    </div>
    <p>Click below to view the submission details.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${link}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Submission</a>
    </div>
  `;

  // Determine the appropriate sender based on context
  const fromAddress = await resolveEmailSender({
    actor,
    companyId,
    plantId,
    fallbackFrom: `"GenBeta" <${process.env.EMAIL_USER || process.env.SMTP_FROM || 'no-reply@genbeta.com'}>`
  });

  const mailOptions = {
    from: fromAddress,
    to,
    subject: `[Form Submitted] ${formId || 'FORM-ID'} – ${formName} | Submitted by ${submitterName}`,
    html: getBaseLayout(content, company, plant)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Submission notification to plant sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Submission notification to plant failed:", error);
    return { messageId: "mock-id", skipped: true };
  }
};

export const sendApprovalStatusNotificationToPlant = async (to, formName, submitterName, approverName, status, comments, link, company = {}, plant = {}, plantId = "", formId = "", submissionId = "", level = 1, actor = "PLANT_ADMIN", companyId = null, plantIdParam = null, approverEmail = null) => {
  const isApproved = status.toUpperCase() === "APPROVED";
  const statusColor = isApproved ? "#10b981" : "#ef4444";
  const statusText = isApproved ? "Approved" : "Rejected";
  const identifier = submissionId ? `${plantId}_${formId}_${formName}_${submissionId}` : `${plantId}_${formId}_${formName}`;
  
  const content = `
    <h2 style="color: ${statusColor};">Form ${statusText}</h2>
    <p style="color: #1f2937; font-size: 16px;">
      <strong>${approverName}</strong> has ${statusText.toLowerCase()} a submission from <strong>${submitterName}</strong>.
    </p>
    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <strong style="font-size: 18px;">${formName}</strong>
      <p style="margin: 10px 0 0 0; font-size: 14px; color: #6b7280;">Status: <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></p>
      ${comments ? `<p style="margin: 10px 0 0 0; font-size: 14px; color: #6b7280;">Comments: "${comments}"</p>` : ''}
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${link}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Submission</a>
    </div>
  `;

  // Use standardized subject format for approval status
  const subject = isApproved 
    ? `[Form Approved] ${formId || 'FORM-ID'} – ${formName} | Level ${level} Approved by ${approverName}`
    : `[Form Rejected] ${formId || 'FORM-ID'} – ${formName} | Level ${level} Rejected by ${approverName}`;
  
  // Use approver's email as sender if provided, otherwise use resolved sender
  const fromAddress = approverEmail 
    ? `"${approverName}" <${approverEmail}>`
    : await resolveEmailSender({
        actor,
        companyId,
        plantId: plantIdParam || plantId,
        fallbackFrom: `"GenBeta" <${process.env.EMAIL_USER || process.env.SMTP_FROM || 'no-reply@genbeta.com'}>`
      });

  const mailOptions = {
    from: fromAddress,
    to,
    subject: subject,
    html: getBaseLayout(content, company, plant)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Approval status notification to plant sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Approval status notification to plant failed:", error);
    return { messageId: "mock-id", skipped: true };
  }
};

export const sendRejectionNotificationToSubmitter = async (to, formName, rejectorName, comments, link, company = {}, plant = {}, plantId = "", formId = "", submissionId = "", actor = "PLANT_ADMIN", companyId = null) => {
  const identifier = submissionId ? `${plantId}_${formId}_${formName}_${submissionId}` : `${plantId}_${formId}_${formName}`;
  
  const content = `
    <h2 style="color: #ef4444;">Form Submission Rejected</h2>
    <p style="color: #1f2937; font-size: 16px;">
      Your submission for <strong>${formName}</strong> has been rejected by <strong>${rejectorName}</strong>.
    </p>
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <strong style="color: #991b1b;">Reason for Rejection:</strong>
      <p style="margin: 10px 0 0 0; color: #7f1d1d;">"${comments}"</p>
    </div>
    <p>Please review the feedback and make necessary corrections before resubmitting.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${link}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Submission</a>
    </div>
  `;

  // Use standardized rejection subject format
  // Determine the appropriate sender based on context
  const fromAddress = await resolveEmailSender({
    actor,
    companyId,
    plantId,
    fallbackFrom: `"GenBeta" <${process.env.EMAIL_USER || process.env.SMTP_FROM || 'no-reply@genbeta.com'}>`
  });

  const mailOptions = {
    from: fromAddress,
    to,
    subject: `[Form Rejected] ${formId || 'FORM-ID'} – ${formName} | Rejected at Level 1`,
    html: getBaseLayout(content, company, plant)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Rejection notification to submitter sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Rejection notification to submitter failed:", error);
    return { messageId: "mock-id", skipped: true };
  }
};

export const sendProfileUpdateNotification = async (to, employeeName, updatedFields, updatedBy, company = {}, plant = {}, actor = "COMPANY_ADMIN", companyId = null, plantId = null) => {
  const fieldsHtml = Object.entries(updatedFields)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `<li style="margin: 5px 0;"><strong>${key}:</strong> ${value}</li>`)
    .join('');

  const content = `
    <h2 style="color: #4f46e5;">Profile Updated</h2>
    <p style="color: #1f2937; font-size: 16px;">
      Hello <strong>${employeeName}</strong>, your profile has been updated${updatedBy ? ` by <strong>${updatedBy}</strong>` : ''}.
    </p>
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <strong style="color: #166534;">Updated Information:</strong>
      <ul style="margin: 10px 0 0 0; color: #15803d; padding-left: 20px;">
        ${fieldsHtml}
      </ul>
    </div>
    <p style="color: #6b7280; font-size: 14px;">
      If you did not expect these changes, please contact your administrator immediately.
    </p>
  `;

  // Determine the appropriate sender based on context
  const fromAddress = await resolveEmailSender({
    actor,
    companyId,
    plantId,
    fallbackFrom: `"GenBeta" <${process.env.EMAIL_USER || process.env.SMTP_FROM || 'no-reply@genbeta.com'}>`
  });

  const mailOptions = {
    from: fromAddress,
    to,
    subject: `Your Profile Has Been Updated`,
    html: getBaseLayout(content, company, plant)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Profile update notification sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Profile update notification failed:", error);
    return { messageId: "mock-id", skipped: true };
  }
};

export const sendFinalApprovalNotificationToSubmitter = async (to, formName, submittedAt, approvalHistory, company = {}, plant = {}, plantId = "", formId = "", submissionId = "", actor = "PLANT_ADMIN", companyId = null, plantIdParam = null) => {
  const identifier = submissionId ? `${plantId}_${formId}_${formName}_${submissionId}` : `${plantId}_${formId}_${formName}`;
  const historyHtml = approvalHistory.map(h => `
    <li style="margin-bottom: 10px;">
      <strong>${h.name}</strong> - Approved at ${new Date(h.date).toLocaleString()}
      ${h.comments ? `<br/><span style="color: #6b7280; font-style: italic;">"${h.comments}"</span>` : ''}
    </li>
  `).join('');

  const content = `
    <h2 style="color: #10b981;">Form Fully Approved</h2>
    <p style="color: #1f2937; font-size: 16px;">
      Your submission for <strong>${formName}</strong> at ${new Date(submittedAt).toLocaleString()} has been fully verified and approved.
    </p>
    <div style="margin: 25px 0;">
      <h4 style="color: #374151; margin-bottom: 15px;">Approval History:</h4>
      <ul style="color: #4b5563; padding-left: 20px;">
        ${historyHtml}
      </ul>
    </div>
  `;

  // Use standardized subject format for final approval
  // Determine the appropriate sender based on context
  const fromAddress = await resolveEmailSender({
    actor,
    companyId,
    plantId: plantIdParam,
    fallbackFrom: `"GenBeta" <${process.env.EMAIL_USER || process.env.SMTP_FROM || 'no-reply@genbeta.com'}>`
  });

  const mailOptions = {
    from: fromAddress,
    to,
    subject: `[Form Fully Approved] ${formId || 'FORM-ID'} – ${formName} | Final Approval Completed`,
    html: getBaseLayout(content, company, plant)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error("Final approval notification failed:", error);
    return { messageId: "mock-id", skipped: true };
  }
};

export const sendFinalApprovalNotificationToPlant = async (to, formName, submittedAt, approvalHistory, company = {}, plant = {}, plantId = "", formId = "", submissionId = "", actor = "PLANT_ADMIN", companyId = null, plantIdParam = null, approverEmail = null, approverName = null) => {
  const identifier = submissionId ? `${plantId}_${formId}_${formName}_${submissionId}` : `${plantId}_${formId}_${formName}`;
  const historyHtml = approvalHistory.map(h => `
    <li style="margin-bottom: 10px;">
      <strong>${h.name}</strong> - Approved at ${new Date(h.date).toLocaleString()}
      ${h.comments ? `<br/><span style="color: #6b7280; font-style: italic;">"${h.comments}"</span>` : ''}
    </li>
  `).join('');

  const content = `
    <h2 style="color: #10b981;">Form Fully Approved</h2>
    <p style="color: #1f2937; font-size: 16px;">
      The submission for <strong>${formName}</strong> at ${new Date(submittedAt).toLocaleString()} has been fully verified and approved.
    </p>
    <div style="margin: 25px 0;">
      <h4 style="color: #374151; margin-bottom: 15px;">Approval History:</h4>
      <ul style="color: #4b5563; padding-left: 20px;">
        ${historyHtml}
      </ul>
    </div>
  `;
  
  // Use approver's email as sender if provided, otherwise use resolved sender
  const fromAddress = approverEmail && approverName
    ? `"${approverName}" <${approverEmail}>`
    : await resolveEmailSender({
        actor,
        companyId,
        plantId: plantIdParam,
        fallbackFrom: `"GenBeta" <${process.env.EMAIL_USER || process.env.SMTP_FROM || 'no-reply@genbeta.com'}>`
      });

  const mailOptions = {
    from: fromAddress,
    to,
    subject: `[Form Fully Approved] ${formId || 'FORM-ID'} – ${formName} | Final Approval Completed`,
    html: getBaseLayout(content, company, plant)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error("Final approval notification to plant failed:", error);
    return { messageId: "mock-id", skipped: true };
  }
};

