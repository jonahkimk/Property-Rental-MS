const ok   = (res, data, message = 'Success', status = 200) =>
  res.status(status).json({ success: true, message, data });

const fail = (res, message = 'An error occurred', status = 400, details = null) =>
  res.status(status).json({ success: false, error: message, ...(details && { details }) });

const paginated = (res, data, total, page, limit) =>
  res.json({
    success: true,
    data,
    pagination: {
      total,
      page:        parseInt(page),
      limit:       parseInt(limit),
      total_pages: Math.ceil(total / limit),
    },
  });

module.exports = { ok, fail, paginated };