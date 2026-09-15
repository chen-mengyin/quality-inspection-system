(function (window) {
  'use strict';

  var config = window.QC_CLOUD_CONFIG || {};
  var client = null;
  var realtimeChannel = null;
  var realtimeTimer = null;
  var realtimeChanges = [];
  var pendingInitialSnapshot = null;
  var PAGE_SIZE = 1000;

  function configured() {
    return !!(config.enabled && config.url && config.publishableKey && window.supabase);
  }

  function shouldUseCloud() {
    if (!configured()) {
      return false;
    }
    if (window.navigator && window.navigator.webdriver && !/[?&]cloud-test=1(?:&|$)/.test(window.location.search || '')) {
      return false;
    }
    return true;
  }

  function getClient() {
    if (!client && configured()) {
      client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: 'qc_cloud_auth'
        }
      });
    }
    return client;
  }

  function normalizeUsername(value) {
    return String(value || '').replace(/^\s+|\s+$/g, '').toLowerCase();
  }

  function usernameEmail(username) {
    var value = normalizeUsername(username);
    var bytes = new TextEncoder().encode(value);
    var hex = '';
    var i;
    for (i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return 'u' + hex + '@accounts.qc-collaboration.app';
  }

  function authPassword(password) {
    return 'Qc!' + String(password || '');
  }

  function cloudError(error, fallback) {
    var message = error && (error.message || error.error_description || error.details);
    if (!message) {
      return new Error(fallback || '云端操作失败');
    }
    if (message.indexOf('relation') >= 0 && message.indexOf('does not exist') >= 0) {
      return new Error('云端数据库尚未初始化，请先执行数据库初始化脚本');
    }
    if (message.indexOf('Email not confirmed') >= 0) {
      return new Error('账号已创建但邮箱确认尚未关闭，请在 Supabase 登录设置中关闭邮箱确认');
    }
    if (message.indexOf('account_inactive') >= 0) {
      return new Error('账号已停用');
    }
    if (message.indexOf('account_profile_missing') >= 0) {
      return new Error('账号未登录或资料不存在');
    }
    return new Error(message);
  }

  function profileToLocal(row, lines) {
    return {
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      lines: lines || [],
      isActive: row.is_active !== false,
      claimed: true
    };
  }

  function lineToLocal(row) {
    return {
      key: row.key,
      name: row.name,
      record_id: row.record_id || ''
    };
  }

  function taskToLocal(row) {
    return {
      id: row.id,
      scheduleSequence: row.schedule_sequence || '',
      orderNo: row.order_no || '',
      projectName: row.project_name || '',
      cabinetType: row.cabinet_type || '',
      quantity: Number(row.quantity) || 0,
      deviceType: row.device_type || '',
      company: row.company || '',
      marketingManager: row.marketing_manager || '',
      procurementOwner: row.procurement_owner || '',
      electricalDesigner: row.electrical_designer || '',
      structuralDesigner: row.structural_designer || '',
      taskCreatedDate: row.task_created_date || '',
      taskRequiredDate: row.task_required_date || '',
      plannedAssemblyStartDate: row.planned_assembly_start_date || '',
      plannedAssemblyDate: row.planned_assembly_date || '',
      plannedQcTime: row.planned_qc_time || '',
      actualStartDate: row.actual_start_date || '',
      deliveryDate: row.delivery_date || '',
      inspectionTime: row.inspection_time || '',
      productionLine: row.production_line || '',
      remark: row.remark || '',
      qcStatus: row.qc_status || 'pending',
      status: row.status || row.qc_status || 'pending',
      urgency: row.urgency || 'normal',
      urgencyManual: row.urgency_manual === true,
      completedDate: Number(row.completed_date) || 0,
      shippingDate: Number(row.shipping_date) || 0,
      isWarehoused: typeof row.is_warehoused === 'boolean' ? row.is_warehoused : null,
      isOnTime: typeof row.is_on_time === 'boolean' ? row.is_on_time : null,
      delayDays: Number(row.delay_days) || 0,
      delayReason: row.delay_reason || '',
      responsibleDepartment: row.responsible_department || '',
      shippingDelay: row.shipping_delay || '',
      assemblyExceptionDetails: row.assembly_exception_details || '',
      serialNo: row.serial_no || '',
      record_id: row.record_id || '',
      exceptionHandled: row.exception_handled === true,
      updatedAt: row.updated_at || ''
    };
  }

  function taskToCloud(row) {
    return {
      id: row.id,
      schedule_sequence: row.scheduleSequence || '',
      order_no: row.orderNo || '',
      project_name: row.projectName || '',
      cabinet_type: row.cabinetType || '',
      quantity: Number(row.quantity) || 0,
      device_type: row.deviceType || '',
      company: row.company || '',
      marketing_manager: row.marketingManager || '',
      procurement_owner: row.procurementOwner || '',
      electrical_designer: row.electricalDesigner || '',
      structural_designer: row.structuralDesigner || '',
      task_created_date: row.taskCreatedDate || '',
      task_required_date: row.taskRequiredDate || '',
      planned_assembly_start_date: row.plannedAssemblyStartDate || '',
      planned_assembly_date: row.plannedAssemblyDate || '',
      planned_qc_time: row.plannedQcTime || '',
      actual_start_date: row.actualStartDate || '',
      delivery_date: row.deliveryDate || '',
      inspection_time: row.inspectionTime || '',
      production_line: row.productionLine || null,
      production_line_name: row.productionLine || '',
      remark: row.remark || '',
      qc_status: row.qcStatus || row.status || 'pending',
      status: row.status || row.qcStatus || 'pending',
      urgency: row.urgency || 'normal',
      urgency_manual: row.urgencyManual === true,
      completed_date: Number(row.completedDate) || 0,
      shipping_date: Number(row.shippingDate) || 0,
      is_warehoused: typeof row.isWarehoused === 'boolean' ? row.isWarehoused : null,
      is_on_time: typeof row.isOnTime === 'boolean' ? row.isOnTime : null,
      delay_days: Number(row.delayDays) || 0,
      delay_reason: row.delayReason || '',
      responsible_department: row.responsibleDepartment || '',
      shipping_delay: row.shippingDelay || '',
      assembly_exception_details: row.assemblyExceptionDetails || '',
      serial_no: row.serialNo || '',
      record_id: row.record_id || '',
      exception_handled: row.exceptionHandled === true
    };
  }

  function feedbackToLocal(row) {
    return {
      id: row.id,
      projectId: row.project_id,
      inspector: row.inspector || '',
      content: row.content || '',
      feedbackDate: Number(row.feedback_date) || 0,
      line: row.line || '',
      conclusion: row.conclusion || 'qualified',
      projectName: row.project_name || '',
      completedQty: Number(row.completed_qty) || 0,
      pendingQty: Number(row.pending_qty) || 0,
      exceptionQty: Number(row.exception_qty) || 0,
      exceptionDesc: row.exception_desc || '',
      missingParts: row.missing_parts || '',
      completedDate: Number(row.completed_date) || 0,
      record_id: row.record_id || ''
    };
  }

  function feedbackToCloud(row) {
    return {
      id: row.id,
      project_id: row.projectId,
      inspector: row.inspector || '',
      content: row.content || '',
      feedback_date: Number(row.feedbackDate) || 0,
      line: row.line || '',
      conclusion: row.conclusion === 'unqualified' ? 'unqualified' : 'qualified',
      project_name: row.projectName || '',
      completed_qty: Number(row.completedQty) || 0,
      pending_qty: Number(row.pendingQty) || 0,
      exception_qty: Number(row.exceptionQty) || 0,
      exception_desc: row.exceptionDesc || '',
      missing_parts: row.missingParts || '',
      completed_date: Number(row.completedDate) || 0,
      record_id: row.record_id || ''
    };
  }

  function exceptionHistoryToLocal(row) {
    return {
      id: row.id,
      projectId: row.project_id || '',
      orderNo: row.order_no || '',
      projectName: row.project_name || '',
      productionLine: row.production_line || '',
      quantity: Number(row.quantity) || 0,
      exceptionQty: Number(row.exception_qty) || 0,
      exceptionDesc: row.exception_desc || '',
      missingParts: row.missing_parts || '',
      inspector: row.inspector || '',
      reportedAt: Number(row.reported_at) || 0,
      status: row.status === 'completed' ? 'completed' : 'reinspection',
      reinspectionAt: Number(row.reinspection_at) || 0,
      completedAt: Number(row.completed_at) || 0
    };
  }

  function accountToLocal(row) {
    return {
      username: row.username,
      password: '',
      name: row.name,
      role: row.role,
      lines: row.lines || [],
      isActive: row.is_active !== false,
      claimed: row.claimed === true
    };
  }

  function summaryToLocal(rows) {
    return (rows || []).map(function (row) {
      return {
        lineKey: row.line_key || '未分配',
        pending: Number(row.pending_count) || 0,
        completed: Number(row.completed_count) || 0,
        exception: Number(row.exception_count) || 0,
        total: Number(row.total_count) || 0
      };
    });
  }

  function initialSnapshotToLocal(data) {
    var tasks = (data && data.tasks) || {};
    return {
      lines: ((data && data.lines) || []).map(lineToLocal),
      production: (tasks.rows || []).map(taskToLocal),
      feedbacks: [],
      summary: summaryToLocal((data && data.summary) || []),
      partial: true
    };
  }

  async function requestInitialSnapshot() {
    var result = await getClient().rpc('get_initial_snapshot');
    if (result.error) {
      throw cloudError(result.error, '读取登录数据失败');
    }
    if (!result.data || !result.data.profile) {
      throw new Error('账号资料不存在');
    }
    return {
      user: profileToLocal(result.data.profile, result.data.profile_lines || []),
      snapshot: initialSnapshotToLocal(result.data)
    };
  }

  async function loadCurrentUser() {
    var api = getClient();
    var sessionResult = await api.auth.getSession();
    if (sessionResult.error || !sessionResult.data || !sessionResult.data.session) {
      return null;
    }
    if (api.realtime) {
      api.realtime.setAuth(sessionResult.data.session.access_token);
    }
    var initial;
    try {
      initial = await requestInitialSnapshot();
    } catch (error) {
      if (error && error.message && error.message.indexOf('停用') >= 0) {
        await api.auth.signOut();
      }
      throw error;
    }
    if (initial.user.isActive === false) {
      await api.auth.signOut();
      throw new Error('账号已停用');
    }
    pendingInitialSnapshot = initial.snapshot;
    return initial.user;
  }

  async function login(username, password) {
    var api = getClient();
    if (!api) {
      throw new Error('云端连接配置无效');
    }
    var normalized = normalizeUsername(username);
    var email = usernameEmail(normalized);
    var signed = await api.auth.signInWithPassword({
      email: email,
      password: authPassword(password)
    });
    if (signed.error) {
      var claim = await api.rpc('claim_account', {
        p_username: normalized,
        p_password: String(password || '')
      });
      if (claim.error || !claim.data) {
        throw cloudError(claim.error || signed.error, '用户名、密码错误或账号未激活');
      }
      var registered = await api.auth.signUp({
        email: email,
        password: authPassword(password),
        options: {
          data: {
            username: normalized,
            claim_token: claim.data
          }
        }
      });
      if (registered.error) {
        throw cloudError(registered.error, '首次激活账号失败');
      }
      if (!registered.data || !registered.data.session) {
        throw new Error('账号已创建但未自动登录，请在 Supabase 登录设置中关闭邮箱确认');
      }
    }
    return loadCurrentUser();
  }

  async function restoreUser() {
    var api = getClient();
    if (!api) {
      return null;
    }
    var result = await api.auth.getSession();
    if (result.error || !result.data || !result.data.session) {
      return null;
    }
    return loadCurrentUser();
  }

  async function fetchAll(table, orderColumn) {
    var api = getClient();
    var rows = [];
    var from = 0;
    var pageSize = 1000;
    var result;
    do {
      var query = api.from(table).select('*').range(from, from + pageSize - 1);
      if (orderColumn) {
        query = query.order(orderColumn, { ascending: true });
      }
      result = await query;
      if (result.error) {
        throw cloudError(result.error, '读取云端数据失败');
      }
      rows = rows.concat(result.data || []);
      from += pageSize;
    } while (result.data && result.data.length === pageSize);
    return rows;
  }

  async function getLines() {
    var result = await getClient().from('production_lines').select('*').order('name', { ascending: true });
    if (result.error) {
      throw cloudError(result.error, '读取产线失败');
    }
    return (result.data || []).map(lineToLocal);
  }

  function summarizeTasks(rows) {
    var map = {};
    var i;
    var row;
    var line;
    var status;
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      line = row.production_line || '未分配';
      status = row.qc_status === 'completed' ? 'completed' : row.qc_status === 'exception' ? 'exception' : 'pending';
      if (!map[line]) {
        map[line] = { lineKey: line, pending: 0, completed: 0, exception: 0, total: 0 };
      }
      map[line][status] += 1;
      map[line].total += 1;
    }
    return Object.keys(map).map(function (key) { return map[key]; });
  }

  async function getDashboardSummary() {
    var result = await getClient().rpc('get_dashboard_summary');
    if (result.error) {
      var fallback = await fetchAll('production_tasks', 'created_at');
      return summarizeTasks(fallback);
    }
    return summaryToLocal(result.data || []);
  }

  function taskMatchesPage(row, options) {
    var status = row.qc_status || row.status || 'pending';
    var search = normalizeUsername(options.search || '');
    if (options.status === 'open' && status === 'completed') {
      return false;
    }
    if (options.status && options.status !== 'all' && options.status !== 'open' && status !== options.status) {
      return false;
    }
    if (options.line && row.production_line !== options.line) {
      return false;
    }
    if (options.dateFrom && row.delivery_date && row.delivery_date < options.dateFrom) {
      return false;
    }
    if (options.dateTo && row.delivery_date && row.delivery_date > options.dateTo) {
      return false;
    }
    if (search) {
      var haystack = normalizeUsername([
        row.order_no,
        row.project_name,
        row.cabinet_type,
        row.production_line,
        row.schedule_sequence
      ].join(' '));
      if (haystack.indexOf(search) < 0) {
        return false;
      }
    }
    return true;
  }

  async function getTaskPage(options) {
    options = options || {};
    var offset = Math.max(0, Number(options.offset) || 0);
    var limit = Math.min(500, Math.max(1, Number(options.limit) || 50));
    var args = {
      p_status: options.status || 'all',
      p_search: options.search || '',
      p_line: options.line || '',
      p_date_from: options.dateFrom || '',
      p_date_to: options.dateTo || '',
      p_inspector: options.inspector || '',
      p_offset: offset,
      p_limit: limit
    };
    var result = await getClient().rpc('get_task_page_filtered', args);
    if (result.error) {
      var fallback = await fetchAll('production_tasks', 'created_at');
      fallback = fallback.filter(function (row) { return taskMatchesPage(row, options); });
      return {
        rows: fallback.slice(offset, offset + limit).map(taskToLocal),
        total: fallback.length
      };
    }
    var data = result.data || {};
    return {
      rows: (data.rows || []).map(taskToLocal),
      total: Number(data.total) || 0
    };
  }

  async function getFeedbacks(projectIds) {
    if (!projectIds || !projectIds.length) {
      return [];
    }
    var unique = [];
    var seen = {};
    var calls = [];
    var rows = [];
    var i;
    for (i = 0; i < projectIds.length; i++) {
      if (projectIds[i] && !seen[projectIds[i]]) {
        seen[projectIds[i]] = true;
        unique.push(projectIds[i]);
      }
    }
    for (i = 0; i < unique.length; i += 100) {
      calls.push(getClient()
        .from('feedbacks')
        .select('*')
        .in('project_id', unique.slice(i, i + 100))
        .order('feedback_date', { ascending: true }));
    }
    var results = await Promise.all(calls);
    for (i = 0; i < results.length; i++) {
      if (results[i].error) {
        throw cloudError(results[i].error, '读取质检反馈失败');
      }
      rows = rows.concat(results[i].data || []);
    }
    return rows.map(feedbackToLocal);
  }

  async function getExceptionHistory() {
    var rows = await fetchAll('exception_history', 'reinspection_at');
    return rows.map(exceptionHistoryToLocal).sort(function (a, b) {
      return (b.completedAt || b.reinspectionAt) - (a.completedAt || a.reinspectionAt);
    });
  }

  async function getTaskList(options) {
    options = options || {};
    var rows = [];
    var offset = 0;
    var result;
    do {
      result = await getTaskPage({
        status: options.status || 'all',
        search: options.search || '',
        line: options.line || '',
        dateFrom: options.dateFrom || '',
        dateTo: options.dateTo || '',
        inspector: options.inspector || '',
        offset: offset,
        limit: 500
      });
      rows = rows.concat(result.rows || []);
      offset += (result.rows || []).length;
    } while (offset < result.total && result.rows && result.rows.length);
    return rows;
  }

  async function getTaskDetail(projectId) {
    var results = await Promise.all([
      getClient().from('production_tasks').select('*').eq('id', projectId).maybeSingle(),
      getClient().from('feedbacks').select('*').eq('project_id', projectId).order('feedback_date', { ascending: true })
    ]);
    if (results[0].error) {
      throw cloudError(results[0].error, '读取任务详情失败');
    }
    if (results[1].error) {
      throw cloudError(results[1].error, '读取质检反馈失败');
    }
    return {
      task: results[0].data ? taskToLocal(results[0].data) : null,
      feedbacks: (results[1].data || []).map(feedbackToLocal)
    };
  }

  async function getAccounts() {
    var result = await getClient().rpc('list_accounts');
    if (result.error) {
      throw cloudError(result.error, '读取账号列表失败');
    }
    return (result.data || []).map(accountToLocal);
  }

  async function getOriginalRows() {
    var result = await getClient()
      .from('upload_batches')
      .select('original_rows')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) {
      throw cloudError(result.error, '读取排产表原件失败');
    }
    return result.data ? (result.data.original_rows || []) : [];
  }

  async function getAllTasks() {
    return (await fetchAll('production_tasks', 'created_at')).map(taskToLocal);
  }

  async function getAllFeedbacks() {
    return (await fetchAll('feedbacks', 'feedback_date')).map(feedbackToLocal);
  }

  async function getCompletedTasksForDay(start, end) {
    var rows = [];
    var offset = 0;
    var result;
    do {
      result = await getClient()
        .from('production_tasks')
        .select('*')
        .eq('qc_status', 'completed')
        .gte('completed_date', start)
        .lt('completed_date', end)
        .order('created_at', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (result.error) {
        throw cloudError(result.error, '读取当日完成任务失败');
      }
      rows = rows.concat(result.data || []);
      offset += (result.data || []).length;
    } while (result.data && result.data.length === PAGE_SIZE);
    return rows.map(taskToLocal);
  }

  async function getFeedbacksForDay(start, end) {
    var rows = [];
    var offset = 0;
    var result;
    do {
      result = await getClient()
        .from('feedbacks')
        .select('*')
        .gte('feedback_date', start)
        .lt('feedback_date', end)
        .order('feedback_date', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (result.error) {
        throw cloudError(result.error, '读取当日质检反馈失败');
      }
      rows = rows.concat(result.data || []);
      offset += (result.data || []).length;
    } while (result.data && result.data.length === PAGE_SIZE);
    return rows.map(feedbackToLocal);
  }

  async function getReportSnapshot(date) {
    var start = new Date(String(date || '') + 'T00:00:00').getTime();
    var end = start + 86400000;
    var openPage = getTaskList({ status: 'open' });
    var completed = getCompletedTasksForDay(start, end);
    var dayFeedbacks = getFeedbacksForDay(start, end);
    var results = await Promise.all([openPage, completed, dayFeedbacks]);
    var rows = results[0].concat(results[1]);
    var feedbacks = results[2];
    var missingIds = [];
    var known = {};
    var i;
    for (i = 0; i < rows.length; i++) { known[rows[i].id] = true; }
    for (i = 0; i < feedbacks.length; i++) {
      if (!known[feedbacks[i].projectId]) { missingIds.push(feedbacks[i].projectId); }
    }
    if (missingIds.length) {
      var missing = await getClient().from('production_tasks').select('*').in('id', missingIds);
      if (missing.error) { throw cloudError(missing.error, '读取日报任务失败'); }
      rows = rows.concat((missing.data || []).map(taskToLocal));
    }
    var allFeedbacks = await getFeedbacks(rows.map(function (row) { return row.id; }));
    return { production: rows, feedbacks: allFeedbacks };
  }

  async function getSnapshot(user) {
    if (pendingInitialSnapshot) {
      var snapshot = pendingInitialSnapshot;
      pendingInitialSnapshot = null;
      return snapshot;
    }
    return (await requestInitialSnapshot()).snapshot;
  }

  async function publishChange(kind, entityId) {
    try {
      var result = await getClient().rpc('publish_change', {
        p_kind: kind,
        p_entity_id: entityId || ''
      });
      if (result.error && window.console && window.console.warn) {
        window.console.warn('云端变更通知发送失败', result.error.message || result.error);
      }
    } catch (error) {
      if (window.console && window.console.warn) {
        window.console.warn('云端变更通知发送失败', error && error.message ? error.message : error);
      }
    }
  }

  async function saveTask(task) {
    var result = await getClient().from('production_tasks').upsert(taskToCloud(task), { onConflict: 'id' });
    if (result.error) {
      throw cloudError(result.error, '保存排产任务失败');
    }
    await publishChange('task', task.id);
  }

  async function deleteTask(id) {
    var result = await getClient().from('production_tasks').delete().eq('id', id);
    if (result.error) {
      throw cloudError(result.error, '删除排产任务失败');
    }
    await publishChange('task_deleted', id);
  }

  async function saveLine(line) {
    var result = await getClient().from('production_lines').upsert({
      key: line.key,
      name: line.name,
      record_id: line.record_id || ''
    }, { onConflict: 'key' });
    if (result.error) {
      throw cloudError(result.error, '保存产线失败');
    }
    await publishChange('line', line.key);
  }

  async function deleteLine(key) {
    var result = await getClient().from('production_lines').delete().eq('key', key);
    if (result.error) {
      throw cloudError(result.error, '删除产线失败');
    }
    await publishChange('line', key);
  }

  async function saveAccount(original, account, password) {
    var result = await getClient().rpc('save_account', {
      p_original: original || '',
      p_username: account.username,
      p_password: password || '',
      p_name: account.name,
      p_role: account.role,
      p_is_active: account.isActive !== false,
      p_lines: account.lines || []
    });
    if (result.error) {
      throw cloudError(result.error, '保存账号失败');
    }
    await publishChange('account', account.username);
    return result.data;
  }

  async function submitFeedback(projectId, data) {
    var result = await getClient().rpc('submit_feedback', {
      p_project_id: projectId,
      p_completed_qty: Number(data.completedQty) || 0,
      p_pending_qty: Number(data.pendingQty) || 0,
      p_exception_qty: Number(data.exceptionQty) || 0,
      p_exception_desc: data.exceptionDesc || '',
      p_missing_parts: data.missingParts || ''
    });
    if (result.error) {
      throw cloudError(result.error, '提交质检反馈失败');
    }
    await publishChange('feedback', projectId);
    return result.data;
  }

  async function resolveException(projectId) {
    var result = await getClient().rpc('resolve_exception', { p_project_id: projectId });
    if (result.error) {
      throw cloudError(result.error, '处理异常失败');
    }
    await publishChange('task', projectId);
    return result.data;
  }

  async function replaceSchedule(records, fileName, originalRows) {
    var result = await getClient().rpc('replace_schedule', {
      p_rows: records.map(taskToCloud),
      p_file_name: fileName || '',
      p_original_rows: originalRows || []
    });
    if (result.error) {
      throw cloudError(result.error, '覆盖排产表失败');
    }
    await publishChange('schedule', 'latest');
    return result.data;
  }

  async function mergeSchedule(records, fileName, originalRows, stats) {
    var client = getClient(), lines = {}, lineRows = [], cloudRows = records.map(taskToCloud), i, result;
    for (i = 0; i < records.length; i++) {
      if (records[i].productionLine && !lines[records[i].productionLine]) {
        lines[records[i].productionLine] = true;
        lineRows.push({ key: records[i].productionLine, name: records[i].productionLine, record_id: '' });
      }
    }
    if (lineRows.length) {
      result = await client.from('production_lines').upsert(lineRows, { onConflict: 'key' });
      if (result.error) {
        throw cloudError(result.error, '同步排产产线失败');
      }
    }
    for (i = 0; i < cloudRows.length; i += 500) {
      result = await client.from('production_tasks').upsert(cloudRows.slice(i, i + 500), { onConflict: 'id' });
      if (result.error) {
        throw cloudError(result.error, '增量保存排产任务失败');
      }
    }
    result = await client.rpc('finalize_schedule_merge', {
      p_file_name: fileName || '',
      p_original_rows: originalRows || [],
      p_row_count: records.length,
      p_created_count: Number(stats && stats.created) || 0,
      p_updated_count: Number(stats && stats.updated) || 0
    });
    if (result.error) {
      throw cloudError(result.error, '增量更新排产表失败');
    }
    await publishChange('schedule', 'latest');
    return result.data;
  }

  async function migrateLegacy(records, feedbacks, originalRows) {
    var result = await getClient().rpc('import_legacy_data', {
      p_tasks: records.map(taskToCloud),
      p_feedbacks: feedbacks.map(feedbackToCloud),
      p_original_rows: originalRows || []
    });
    if (result.error) {
      throw cloudError(result.error, '迁移本地数据失败');
    }
    await publishChange('schedule', 'legacy');
    return result.data;
  }

  async function changePassword(password) {
    if (String(password || '').length < 6) {
      throw new Error('新密码至少需要 6 位');
    }
    var result = await getClient().auth.updateUser({ password: authPassword(password) });
    if (result.error) {
      throw cloudError(result.error, '修改密码失败');
    }
  }

  async function logout() {
    unsubscribe();
    pendingInitialSnapshot = null;
    if (getClient()) {
      await getClient().auth.signOut();
    }
  }

  function subscribe(handler) {
    unsubscribe();
    if (!getClient() || typeof handler !== 'function') {
      return;
    }
    realtimeChannel = getClient()
      .channel('qc-collaboration-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_change_events' }, changed)
      .subscribe();

    function changed(payload) {
      if (payload && payload.new) {
        realtimeChanges.push({
          id: payload.new.id,
          kind: payload.new.kind || 'refresh',
          entityId: payload.new.entity_id || '',
          createdBy: payload.new.created_by || ''
        });
      }
      if (realtimeTimer) {
        clearTimeout(realtimeTimer);
      }
      realtimeTimer = setTimeout(function () {
        var changes = realtimeChanges.slice();
        realtimeChanges = [];
        handler(changes);
      }, 500);
    }
  }

  function unsubscribe() {
    if (realtimeTimer) {
      clearTimeout(realtimeTimer);
      realtimeTimer = null;
    }
    realtimeChanges = [];
    if (realtimeChannel && getClient()) {
      getClient().removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  window.QCCloud = {
    apiVersion: 8,
    configured: configured,
    shouldUseCloud: shouldUseCloud,
    login: login,
    restoreUser: restoreUser,
    getSnapshot: getSnapshot,
    getDashboardSummary: getDashboardSummary,
    getTaskPage: getTaskPage,
    getTaskList: getTaskList,
    getTaskDetail: getTaskDetail,
    getFeedbacks: getFeedbacks,
    getExceptionHistory: getExceptionHistory,
    getAccounts: getAccounts,
    getOriginalRows: getOriginalRows,
    getAllTasks: getAllTasks,
    getAllFeedbacks: getAllFeedbacks,
    getReportSnapshot: getReportSnapshot,
    getLines: getLines,
    saveTask: saveTask,
    deleteTask: deleteTask,
    saveLine: saveLine,
    deleteLine: deleteLine,
    saveAccount: saveAccount,
    submitFeedback: submitFeedback,
    resolveException: resolveException,
    replaceSchedule: replaceSchedule,
    mergeSchedule: mergeSchedule,
    migrateLegacy: migrateLegacy,
    changePassword: changePassword,
    logout: logout,
    subscribe: subscribe,
    unsubscribe: unsubscribe
  };
}(window));
