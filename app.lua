-- Required Lua/Lapis includes
local bcrypt = require("bcrypt")
local lapis = require("lapis")
local config = require("lapis.config").get()

-- 3rd-party libraries.
local json = require("modules/3p_libs/json/json")

-- Local modules
local FSMNodes = require("modules/fsm_nodes")
local varm_util = require("modules/varm_util")

-- Database models
local User = require("models/user")
local Project = require("models/project")

-- Initial Application setup.
local app = lapis.Application()
app:enable("etlua")
app.layout = require "views.layout_default"

app:get("/", function(self)
  -- Display an error message if appropriate.
  err_msg = self.session.err_msg
  self.session.err_msg = nil

  -- Load the User's 'projects' page if a user is signed in,
  -- otherwise redirect to sign-in/up page.
  current_user = self.session.current_user
  if not self.session.current_user then
    return { render = "sign_in" }
  else
    return { redirect_to = "/projects" }
  end
  -- (Shouldn't ever be reached)
  return { render = "index" }
end)

app:get("/projects", function(self)
  -- If there isn't a signed-in user, redirect to the landing page.
  if not self.session.current_user then
    self.session.err_msg = "You must be signed in to view this page."
    return { redirect_to = "/" }
  end
  current_user = self.session.current_user

  -- Load the user's projects. TODO: Paging, folders, just...some sort
  -- of organization.
  current_projects = Project:select("where user_id = ?", current_user.id)
  return { render = "projects" }
end)

app:post("/new_project", function(self)
  -- If there isn't a signed-in user, redirect to the landing page.
  if not self.session.current_user then
    self.session.err_msg = "You must be signed in to use this page."
    return { redirect_to = "/" }
  end
  -- If the required parameters are not provided, return to the /projects
  -- page without creating a new entry.
  if not self.params.title or self.params.title == "" then
    return { redirect_to = "/projects" }
  end
  -- Ditto if the current user already has a project with the given title.
  local existing_proj = Project:select("where user_id = ? and title = ?",
    self.session.current_user.id,
    self.params.title)
  if next(existing_proj) then
    return { redirect_to = "/projects" }
  end

  -- Create a new project for the user with the given title, and pass
  -- it on to the /projects page.
  new_project = Project:create({
    user_id = self.session.current_user.id,
    title   = self.params.title
  })
  -- Return to the base 'projects' page.
  return { redirect_to = "/projects" }
end)

app:match("/project/:project_id", function(self)
  -- If there isn't a signed-in user, redirect to the landing page.
  if not self.session.current_user then
    self.session.err_msg = "You must be signed in to use this page."
    return { redirect_to = "/" }
  end
  -- If no ID is provided, return without action.
  if not self.params.project_id or self.params.project_id == "" then
    return { redirect_to "/projects" }
  end
  proj_id = tonumber(self.params.project_id)
  -- If no project exists with the given ID, return without action.
  current_project = Project:find(proj_id)
  if not current_project then
    return { redirect_to "/projects" }
  end
  -- If the current user does not own the given project,
  -- return without action.
  current_user = self.session.current_user
  if current_project.user_id ~= current_user.id then
    return { redirect_to "/projects" }
  end

  -- Load the nested list of tools to display.
  -- TODO: Organize this and move it somewhere sensible.
  tool_list = { }
  core_utils_list = { }
  core_utils_list["Boot"] = "Node"
  core_utils_list["Delay"] = "Node"
  core_utils_list["Label"] = "Node"
  core_utils_list["Jump"] = "Node"
  core_utils_list["Enable Hardware Interrupt"] = "Node"
  core_utils_list["Hardware Interrupt (Start)"] = "Node"
  core_utils_list["Hardware Interrupt (Finish)"] = "Node"
  core_utils_list["No-op (Do Nothing)"] = "Node"
  tool_list["Core Utilities"] = core_utils_list
  gpio_list = { }
  gpio_list["Setup GPIO Pin"] = "Node"
  gpio_list["Read Input Pin"] = "Node"
  gpio_list["Write Output Pin"] = "Node"
  tool_list["GPIO"] = gpio_list
  rcc_list = { }
  rcc_list["Enable Peripheral Clock"] = "Node"
  rcc_list["Disable Peripheral Clock"] = "Node"
  tool_list["RCC"] = rcc_list
  vars_logic_list = { }
  vars_logic_list["Define Variable"] = "Node"
  vars_logic_list["Set Variable"] = "Node"
  logic_mods_list = { }
  logic_mods_list["Add or Subtract"] = "Node"
  logic_mods_list["Multiply"] = "Node"
  logic_mods_list["Divide"] = "Node"
  logic_mods_list["Orr-Equals"] = "Node"
  logic_mods_list["And-Equals"] = "Node"
  logic_mods_list["Bitwise Not"] = "Node"
  logic_mods_list["Logical Not"] = "Node"
  vars_logic_list["Variable Modification"] = logic_mods_list
  tool_list["Variables and Logic"] = vars_logic_list
  periphs_list = { }
  periphs_i2c_list = { }
  periphs_i2c_list["Initialize I2C"] = "Node"
  periphs_i2c_list["Deinitialize I2C"] = "Node"
  periphs_list["I2C"] = periphs_i2c_list
  periphs_adc_list = { }
  periphs_adc_list["Initialize ADC"] = "Node"
  periphs_adc_list["Deinitialize ADC"] = "Node"
  periphs_adc_list["Read ADC Pin"] = "Node"
  periphs_list["ADC"] = periphs_adc_list
  periphs_rtc_list = { }
  periphs_rtc_list["Initialize RTC"] = "Node"
  periphs_rtc_list["Read RTC Time"] = "Node"
  periphs_rtc_list["Read RTC Date"] = "Node"
  periphs_rtc_list["Set RTC Time"] = "Node"
  periphs_rtc_list["Set RTC Date"] = "Node"
  periphs_list["RTC"] = periphs_rtc_list
  tool_list["Hardware Peripherals"] = periphs_list
  external_devices_list = { }
  external_devices_ssd1306_list = { }
  external_devices_ssd1306_list["Initialize Screen"] = "Node"
  external_devices_ssd1306_list["Deinitialize Screen"] = "Node"
  external_devices_ssd1306_list["Draw Pixel"] = "Node"
  external_devices_ssd1306_list["Draw Horizontal Line"] = "Node"
  external_devices_ssd1306_list["Draw Vertical Line"] = "Node"
  external_devices_ssd1306_list["Draw Rectangle"] = "Node"
  external_devices_ssd1306_list["Draw Text"] = "Node"
  external_devices_ssd1306_list["Refresh Display"] = "Node"
  external_devices_list["SSD1306 OLED Screen"] = external_devices_ssd1306_list
  external_devices_ws2812_list = { }
  external_devices_ws2812_list["Write NeoPixel"] = "Node"
  external_devices_ws2812_list["Latch NeoPixels"] = "Node"
  external_devices_list["WS2812B NeoPixel LED"] = external_devices_ws2812_list
  tool_list["External Devices"] = external_devices_list
  branch_nodes_list = { }
  branch_nodes_list["Is Variable Truth-y?"] = "Node"
  branch_nodes_list["Are Variables Equal?"] = "Node"
  branch_nodes_list["Is A Greater than B?"] = "Node"
  branch_nodes_list["Is A Greater or Equal to B?"] = "Node"
  branch_nodes_list["Is A Less than B?"] = "Node"
  branch_nodes_list["Is A Lesser or Equal to B?"] = "Node"
  tool_list["If-Else Branching Nodes"] = branch_nodes_list

  -- Check for a previously-saved file.
  -- TODO: Decryption? (After encrypting saved files)
  local i_file = io.open("project_storage/project_" .. proj_id .. ".json", "r")
  loaded_nodes_str = nil
  if i_file then
    loaded_nodes_str = i_file:read("*a")
    i_file:close()
  end

  return { render = "project_show" }
end)

-- Pre-compile an array of nodes into actual code.
app:post("/precompile_project_file/:project_id", function(self)
  -- If there isn't a signed-in user, return without action.
  if not self.session.current_user then
    self.session.err_msg = "You must be signed in to use this page."
    return { status = 403 }
  end
  -- If no ID is provided, return without action.
  if not self.params.project_id or self.params.project_id == "" then
    return { status = 400 }
  end
  local proj_id = tonumber(self.params.project_id)
  -- If no project exists with the given ID, return without action.
  local proj = Project:find(proj_id)
  if not proj then
    return { status = 404 }
  end
  -- If the current user does not own the given project,
  -- return without action.
  if proj.user_id ~= self.session.current_user.id then
    return { status = 403 }
  end

  -- Save the provided JSON string to a file.
  local up_file = self.params.file
  local boot_index = -1
  local entry_nodes = {}
  local entry_nodes_lookup = {}
  local ret_status = 200
  local status_msg = 'success'
  if not up_file then
    ret_status = 500
    status_msg = 'invalid file upload'
  end
  local uploaded_obj = json.decode(up_file.content)
  --local up_nodes = uploaded_obj.nodes
  local up_nodes = {}
  local globals = uploaded_obj.g_vars
  -- Find the 'Boot' node.
  for i, val in pairs(uploaded_obj.nodes) do
    if val then
      -- Account for lua's 1-indexing of tables.
      up_nodes[val.node_ind] = val
      if val.node_type == 'Boot' then
        if boot_index == -1 then
          boot_index = val.node_ind
          entry_nodes_lookup['Boot'] = boot_index
        else
          ret_status = 500
          status_msg = 'More than one Boot node passed in.'
        end
      elseif val.node_type == 'Interrupt' then
        if not entry_nodes_lookup[val.code_destination] then
          entry_nodes_lookup[val.code_destination] = val.node_ind
        else
          ret_status = 500
          status_msg = 'More than one entry node for hardware interrupt: ' .. val.code_destination
        end
      end
    end
  end
  -- Fill out the 'entry_nodes' table.
  for i, val in pairs(entry_nodes_lookup) do
    table.insert(entry_nodes, val)
  end
  -- Done; copy 'nodes' struct and verify the existance of a
  -- 'Boot' node to start the program at.
  local nodes = up_nodes
  if boot_index == -1 then
    ret_status = 500
    status_msg = 'No Boot node passed in.'
  end

  -- Define initial global variables. (Code auto-gen done with 'Boot' node)
  local global_decs = {}
  if globals then
    for i, val in pairs(globals) do
      if val and val.var_name and val.var_type then
        local i_val = val.var_val
        if not i_val then
          if val.var_type == 'int' then
            i_val = 0
          elseif val.var_type == 'float' then
            i_val = 0.0
          elseif val.var_type == 'bool' then
            i_val = true
          elseif val.var_type == 'char' then
            i_val = '\0'
          end
        end
        table.insert(global_decs, {
          var_name = val.var_name,
          var_type = val.var_type,
          var_val = i_val
        })
      end
    end
  end

  -- Create an empty 'project state'
  local proj_state = {}
  -- Starting at 'Boot', process each node in order.
  local cur_ind = boot_index
  local cur_node = nil
  local visited_nodes = {}
  local preprocessing = true
  if ret_status == 200 then
    -- Lua arrays are 1-indexed :/
    cur_node = nodes[cur_ind]
    if not (cur_node and cur_node.node_ind == cur_ind) then
      ret_status = 500
      status_msg = 'Could not find node ' .. cur_ind
    end
    proj_state = FSMNodes.init_project_state(cur_node, nodes, global_decs, proj_id)
    local indices_to_process = entry_nodes
    while preprocessing do
      cur_ind = table.remove(indices_to_process)
      if (not cur_ind) and cur_ind ~= 0 then
        preprocessing = false
        break
      end
      cur_node = nodes[cur_ind]
      if not (cur_node and cur_node.node_ind == cur_ind) then
        preprocessing = false
        ret_status = 500
        status_msg = 'Node does not exist: ' .. cur_ind
        break
      end
      if not visited_nodes[cur_ind] then
        -- Only process each node once.
        local node_processed = FSMNodes.process_node(cur_node, nodes, proj_state)
        if not node_processed then
          preprocessing = false
          ret_status = 500
          status_msg = 'Error processing node: ' .. cur_ind
        end
        if preprocessing then
          if cur_node.output then
            if cur_node.output.single then
              visited_nodes[cur_ind] = true
              table.insert(indices_to_process, cur_node.output.single)
            elseif cur_node.output.branch_t and cur_node.output.branch_f then
              visited_nodes[cur_ind] = true
              table.insert(indices_to_process, cur_node.output.branch_t)
              table.insert(indices_to_process, cur_node.output.branch_f)
            elseif cur_node.node_type == 'Interrupt_End' then
              -- (Special type of node which has no outputs.)
              visited_nodes[cur_ind] = true
            else
              preprocessing = false
              ret_status = 500
              status_msg = 'Invalid output options passed in node ' .. cur_ind
            end
          elseif cur_node.node_type == 'Interrupt_End' then
            -- (Special type of node which has no outputs.)
            visited_nodes[cur_ind] = true
          else
            preprocessing = false
            ret_status = 500
            status_msg = 'Invalid output options passed in node ' .. cur_ind
          end
        end
      end
    end
  end
  -- Done; return information about the precompilation.
  return {
    json = {
      precompile_status = status_msg,
      boot_index = boot_index,
      nodes = nodes,
      last_index = cur_ind,
      visited_nodes = visited_nodes
    },
    status = ret_status
  }
end)

-- Compile an existing project which has already been pre-compiled.
app:match("/compile_project/:project_id", function(self)
  -- If there isn't a signed-in user, return without action.
  if not self.session.current_user then
    self.session.err_msg = "You must be signed in to use this page."
    return { status = 403 }
  end
  -- If no ID is provided, return without action.
  if not self.params.project_id or self.params.project_id == "" then
    return { status = 400 }
  end
  local proj_id = tonumber(self.params.project_id)
  -- If no project exists with the given ID, return without action.
  local proj = Project:find(proj_id)
  if not proj then
    return { status = 404 }
  end
  -- If the current user does not own the given project,
  -- return without action.
  if proj.user_id ~= self.session.current_user.id then
    return { status = 403 }
  end

  -- Attempt to compile the project.
  local ret_status = 200
  local status_msg = 'Success.'
  local base_proj_path = 'project_storage/precomp_' .. tostring(proj_id) .. '/'
  if varm_util.path_exists(base_proj_path) and
     varm_util.path_exists(base_proj_path .. 'Makefile') then
     -- Execute 'make', and check the result for success.
     -- ('path_exists' should check that 'base_proj_path' is sanitized)
     local made = os.execute('cd ' .. base_proj_path .. '; make clean && make')
     if not made then
       ret_status = 500
       status_msg = 'Error running GNU Make command.'
     end
  else
    ret_status = 404
    status_msg = 'Error: Could not find a precompiled project for Project ' .. tostring(proj_id)
  end
  return {
    json = {
      compile_status = status_msg
    },
    status = ret_status
  }
end)

-- Upload a compiled project to a chip plugged into the host machine.
-- Currently, just use GDB to connect to local port 4242 and don't check
-- that the correct type of MCU core is being targeted - TODO.
app:match("/upload_project/:project_id", function(self)
  -- If there isn't a signed-in user, return without action.
  if not self.session.current_user then
    self.session.err_msg = "You must be signed in to use this page."
    return { status = 403 }
  end
  -- If no ID is provided, return without action.
  if not self.params.project_id or self.params.project_id == "" then
    return { status = 400 }
  end
  local proj_id = tonumber(self.params.project_id)
  -- If no project exists with the given ID, return without action.
  local proj = Project:find(proj_id)
  if not proj then
    return { status = 404 }
  end
  -- If the current user does not own the given project,
  -- return without action.
  if proj.user_id ~= self.session.current_user.id then
    return { status = 403 }
  end

  -- Attempt to upload the program.
  local ret_status = 200
  local upload_status = 'Success.'
  local base_proj_dir = 'project_storage/precomp_' .. tostring(proj_id) .. '/'
  if varm_util.path_exists(base_proj_dir) and
     varm_util.path_exists(base_proj_dir .. 'main.elf') then
    local confident_in_success = false
    -- ('base_proj_dir' should be sanitized if 'path_exists' returns true)
    -- '2>' logs stderr to a separate file; io.popen can't read it :(
    -- The 'EOF' block wraps commands to send within GDB, one per line.
    local cmd = 'arm-none-eabi-gdb ' .. base_proj_dir .. 'main.elf' ..
                ' 2> ' .. base_proj_dir .. 'last_upload.log' ..
                ' << EOF\n' .. 'target extended-remote :4242\n' ..
                'load\n' .. 'disconnect\n' .. 'quit\n' .. 'EOF\n'
    local flash_out = io.popen(cmd)
    if flash_out then
      local probably_successful = false
      for line in flash_out:lines() do
        if line:find('Ending remote debugging') then
          probably_successful = true
        elseif line:find('Connection timed out') then
          -- (Probably reported in stderr rather than stdout, but...)
          ret_status = 404
          upload_status = 'Error: Could not find remote debugging connection at local port 4242.'
        end
      end
      flash_out:close()
      if not probably_successful then
        -- Timeouts are often reported to stder; check our log.
        local flash_err_log = io.open(base_proj_dir .. 'last_upload.log', 'r')
        local err_found = false
        if flash_err_log then
          for e_line in flash_err_log:lines() do
            if e_line:find('Connection timed out') then
              err_found = true
              break
            end
          end
          flash_err_log:close()
        end
        if err_found then
          ret_status = 404
          upload_status = 'Error: Could not find remote debugging connection at local port 4242.'
        else
          ret_status = 400
          upload_status = 'Warning: Not sure if GDB script exited cleanly.'
        end
      end
    else
      ret_status = 500
      upload_status = 'Error executing GDB target/load.'
    end
  else
    ret_status = 404
    upload_status = 'Cannot find compiled project for ID ' .. tostring(proj_id)
  end
  return {
    json = {
      status_msg = upload_status
    },
    status = ret_status
  }
end)

app:match("/project/delete/:project_id", function(self)
  -- If there isn't a signed-in user, redirect to the landing page.
  if not self.session.current_user then
    self.session.err_msg = "You must be signed in to use this page."
    return { redirect_to = "/" }
  end
  -- If no ID is provided, return without action.
  if not self.params.project_id or self.params.project_id == "" then
    return { redirect_to "/projects" }
  end
  local proj_id = tonumber(self.params.project_id)
  -- If no project exists with the given ID, return without action.
  local proj = Project:find(proj_id)
  if not proj then
    return { redirect_to "/projects" }
  end
  -- If the current user does not own the given project,
  -- return without action.
  if proj.user_id ~= self.session.current_user.id then
    return { redirect_to "/projects" }
  end

  -- Delete the project. TODO: Alert the user if deletion fails.
  local deleted = proj:delete()

  -- Return to the base 'projects' page.
  return { redirect_to = "/projects" }
end)

app:post("/save_project_file/:project_id", function(self)
  -- If there isn't a signed-in user, redirect to the landing page.
  if not self.session.current_user then
    self.session.err_msg = "You must be signed in to use this page."
    return { status = 403 }
  end
  -- If no ID is provided, return without action.
  if not self.params.project_id or self.params.project_id == "" then
    return { status = 400 }
  end
  local proj_id = tonumber(self.params.project_id)
  -- If no project exists with the given ID, return without action.
  local proj = Project:find(proj_id)
  if not proj then
    return { status = 404 }
  end
  -- If the current user does not own the given project,
  -- return without action.
  if proj.user_id ~= self.session.current_user.id then
    return { status = 403 }
  end

  -- Save the provided JSON string to a file.
  local save_file = self.params.file
  if save_file and save_file.content then
    -- TODO: Any more input sanitation or validation?
    local o_file = io.open("project_storage/project_" .. proj_id .. ".json", "w")
    if o_file then
      o_file:write(save_file.content)
      o_file:close()
    end
  end

  -- Done.
  return { json = { status = 'success' }, status = 200 }
end)

app:post("/sign_up", function(self)
  if not self.params.username or self.params.username == "" then
    self.session.err_msg = "No username provided."
    return { redirect_to = "/" }
  elseif not self.params.password or self.params.password == "" then
    self.session.err_msg = "No password provided."
    return { redirect_to = "/" }
  else
    local existing_user = User:find({ username = self.params.username })
    if existing_user then
      self.session.err_msg = "Sorry, that username is taken."
      return { redirect_to = "/" }
    end
    -- Email is optional, but recommended.
    local user_email = ""
    if self.params.email and self.params.email ~= "" then
      user_email = self.params.email
      existing_user = User:find({ email = user_email })
      if existing_user then
        self.session.err_msg = "Sorry, that email address is already in use."
        return { redirect_to = "/" }
      end
    end

    -- Generate the password's salt.
    local salt = ""
    for i=1,16,1 do
      salt = salt .. string.char(math.random(33, 126))
    end
    local digest = bcrypt.digest(self.params.password..salt, BCRYPT_NUM_CYCLES)
    local new_user = User:create({
      username = self.params.username,
      email = user_email,
      digest = digest,
      salt = salt,
      admin_level = 0
    })
    -- Login the current user.
    self.session.current_user = new_user
    return { redirect_to = "/" }
  end
  return { redirect_to = "/" }
end)

app:post("/sign_in", function(self)
  -- Check that a username or email is provided, and the User exists.
  if not self.params.identifier or self.params.identifier == "" then
    self.session.err_msg = "No username or email provided."
    return { redirect_to = "/" }
  elseif not self.params.password or self.params.password == "" then
    self.session.err_msg = "No password provided."
    return { redirect_to = "/" }
  else
    local existing_user = User:find({ username = self.params.identifier })
    local id_type = ""
    if existing_user then
      id_type = "username"
    else
      existing_user = User:find({ email = self.params.identifier })
      if existing_user then
        id_type = "email"
      else
        self.session.err_msg = "No user found with that username and/or email"
        return { redirect_to = "/" }
      end
    end
    -- Check that the password matches.
    if bcrypt.verify((self.params.password..existing_user.salt), existing_user.digest) then
      self.session.current_user = existing_user
      return { redirect_to = "/" }
    end
    self.session.err_msg = "Incorrect password."
    return { redirect_to = "/" }
  end
end)

app:get("/sign_out", function(self)
  self.session.current_user = nil
  -- TODO: Any other session variable stuff to clear?

  -- Redirect to the landing page.
  return { redirect_to = "/" }
end)

return app
