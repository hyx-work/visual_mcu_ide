local varm_util = require("modules/varm_util")

local FSMNodes = {}

-- Create the initial filesystem structure for the project, using
-- information stored in the startup 'Boot' node. Store relevant
-- information in a table for the preprocessor to keep track of.
function FSMNodes.init_project_state(boot_node, node_graph, proj_id)
  local p_state = {}
  local proj_int = tonumber(proj_id)
  if proj_int <= 0 then
    return p_state
  end
  -- Set the base directory, and make it if it doesn't exist.
  local proj_dir = 'project_storage/precomp_' .. proj_int .. '/'
  if varm_util.ensure_dir_empty(proj_dir) then
    p_state.base_dir = proj_dir
    -- Verify or create other required directories for the project skeleton.
    -- Also empty the directory contents, if any.
    if varm_util.ensure_dir_empty(proj_dir .. 'boot_s/') and
       varm_util.ensure_dir_empty(proj_dir .. 'ld/') and
       varm_util.ensure_dir_empty(proj_dir .. 'lib/') and
       varm_util.ensure_dir_empty(proj_dir .. 'vector_tables/') and
       varm_util.ensure_dir_empty(proj_dir .. 'src/') and
       varm_util.ensure_dir_empty(proj_dir .. 'src/std_periph/') and
       varm_util.ensure_dir_empty(proj_dir .. 'src/arm_include/') then
      p_state.dir_structure = 'valid'
      -- Generate the 'boot' assembly script.
      p_state.boot_script = FSMNodes.gen_boot_script(boot_node, p_state)
      -- Generate the linker script.
      p_state.ld_script = FSMNodes.gen_ld_script(boot_node, p_state)
      -- Copy the static GCC libs.
      p_state.with_toolchain_libs = FSMNodes.copy_static_libs(boot_node, p_state)
      -- Generate the vector table.
      p_state.vector_table = FSMNodes.gen_vector_table(boo_node, p_state)
      -- Generate the bare-bones source files.
      p_state.src_base = FSMNodes.gen_bare_source_files(boot_node, p_state)
      -- Generate the Makefile, and add LICENSE/README.md files.
      p_state.build_files_generated = FSMNodes.gen_build_files(boot_node, p_state)
     else
       return p_state
     end
  else
    return p_state
  end
  return p_state
end

function FSMNodes.get_boot_chip_type(boot_node)
  -- (Default value)
  local chip_type = 'STM32F030F4'
  if boot_node and boot_node.options and boot_node.options.chip_type then
    local boot_chip = boot_node.options.chip_type
    -- (Accepted options.)
    if boot_chip == 'STM32F030F4' or
       boot_chip == 'STM32F031F6' then
      chip_type = boot_chip
     end
  end
  return chip_type
end

-- Generate a .S assembly script to boot the specified chip with the
-- specified options (from the 'Boot' node.) It resets the 'bss' portions of
-- RAM to 0s, copies the 'data' portions, sets the core clock frequency,
-- that sort of annoying bookkeeping stuff.
-- Return the relative path to the generated boot script.
function FSMNodes.gen_boot_script(boot_node, cur_proj_state)
  local chip_type = FSMNodes.get_boot_chip_type(boot_node)

  -- Copy the appropriate boot script.
  local boot_script_fn = chip_type .. 'T6_boot.S'
  local boot_script_source_dir = 'static/node_code/boot/boot/'
  local boot_script_source_path = boot_script_source_dir .. boot_script_fn
  local boot_script_dest_dir = cur_proj_state.base_dir .. 'boot_s/'
  local boot_script_dest_path = boot_script_dest_dir .. boot_script_fn
  if varm_util.copy_text_file(boot_script_source_path, boot_script_dest_path) then
    return boot_script_dest_path
  end
  return nil
end

-- Copy a linker script for the given MCU chip into the 'ld/' directory.
-- Linker scripts specify things like how much RAM and Flash storage
-- the chip has available, so the compiler knows which addresses to use.
function FSMNodes.gen_ld_script(boot_node, cur_proj_state)
  local chip_type = FSMNodes.get_boot_chip_type(boot_node)

  -- Copy the appropriate linker script.
  local ld_script_fn = chip_type .. 'T6.ld'
  local ld_script_source_dir = 'static/node_code/boot/ld/'
  local ld_script_source_path = ld_script_source_dir .. ld_script_fn
  local ld_script_dest_dir = cur_proj_state.base_dir .. 'ld/'
  local ld_script_dest_path = ld_script_dest_dir .. ld_script_fn
  if varm_util.copy_text_file(ld_script_source_path, ld_script_dest_path) then
    return ld_script_dest_path
  end
  return nil
end

-- Copy library files. TODO: These files are too big. They should come with
-- the GCC toolchain, but I've had trouble with getting it to recognize
-- the correct 'libc' libraries for local armv6m builds automatically.
-- (These library files are a little over 10MB put together)
function FSMNodes.copy_static_libs(boot_node, cur_proj_state)
  -- These are the same for all armv6m chips, although lines other than
  -- Cortex-M0 chips may be armv7m. But really, these libraries shouldn't
  -- need to be served as part of a generated project.
  local libc_fn = 'libc.a'
  local libgcc_fn = 'libgcc.a'
  local clib_source_dir = 'static/node_code/boot/lib/'
  local libc_source_path = clib_source_dir .. libc_fn
  local libgcc_source_path = clib_source_dir .. libgcc_fn
  local clib_dest_dir = cur_proj_state.base_dir .. 'lib/'
  local libc_dest_path = clib_dest_dir .. libc_fn
  local libgcc_dest_path = clib_dest_dir .. libgcc_fn
  if not varm_util.copy_bin_file(libc_source_path, libc_dest_path) then
    return nil
  end
  if not varm_util.copy_bin_file(libgcc_source_path, libgcc_dest_path) then
    return nil
  end
  -- This method just returns a flag for 'toolchain libraries okay/not okay'
  return true
end

-- Generate a vector table for the given chip. Eventually, this can be used
-- to set hardware interrupts, but for now just copy a common one which
-- routes all interrupts to a common default 'error/infinite loop' handler.
function FSMNodes.gen_vector_table(boot_node, cur_proj_state)
  local chip_type = FSMNodes.get_boot_chip_type(boot_node)

  -- Copy the appropriate vector table file.
  local vt_script_fn = chip_type .. 'T6_vt.S'
  local vt_script_source_dir = 'static/node_code/boot/vector_tables/'
  local vt_script_source_path = vt_script_source_dir .. vt_script_fn
  local vt_script_dest_dir = cur_proj_state.base_dir .. 'vector_tables/'
  local vt_script_dest_path = vt_script_dest_dir .. vt_script_fn
  -- Copy files.
  if varm_util.copy_text_file(vt_script_source_path, vt_script_dest_path) then
    return vt_script_dest_path
  end
  return nil
end

-- Generate bare-bones source files; basically, some mostly-empty headers
-- / utility files, and an empty main method which should get called after
-- booting, if you compiled everything after the 'init_project_state' method.
function FSMNodes.gen_bare_source_files(boot_node, cur_proj_state)
  local chip_type = FSMNodes.get_boot_chip_type(boot_node)

  -- Right now, it looks like we should copy:
  -- - src/core.S
  -- - src/util.S
  -- - src/main.c
  -- - src/main.h
  -- - src/global.h
  -- - src/util_c.h
  -- - src/util_c.c
  -- - src/stm32f0xx.h
  -- - src/stm32f0xx_conf.h
  -- - src/std_periph
  --   - (none)
  -- - src/arm_include/
  --   - arm_common_tables.h
  --   - arm_const_structs.h
  --   - arm_math.h
  --   - core_cm0.h
  --   - core_cm0plus.h
  --   - core_cmFunc.h
  --   - core_cmInstr.h
  local files_to_copy = { 'src/core.S', 'src/util.S', 'src/global.h',
                          'src/main.h', 'src/main.c', 'src/stm32f0xx.h',
                          'src/util_c.h', 'src/util_c.c',
                          'src/stm32f0xx_conf.h',
                          'src/arm_include/arm_common_tables.h',
                          'src/arm_include/arm_const_structs.h',
                          'src/arm_include/arm_math.h',
                          'src/arm_include/core_cm0.h',
                          'src/arm_include/core_cm0plus.h', --TODO: delete?
                          'src/arm_include/core_cmFunc.h',
                          'src/arm_include/core_cmInstr.h',
                        }
  local copy_success = true
  for k, val in pairs(files_to_copy) do
    if val then
      local src_p = 'static/node_code/boot/' .. val
      local dest_p = cur_proj_state.base_dir .. val
      if not varm_util.copy_text_file(src_p, dest_p) then
        copy_success = false
      end
    end
  end
  return copy_success
end

-- Generate build files. So, a GNU Makefile, a README.md which advises
-- users not to take programming tips from the autogenerated GOTO-riddled
-- code, and an MIT LICENSE file.
function FSMNodes.gen_build_files(boot_node, cur_proj_state)
  local chip_type = FSMNodes.get_boot_chip_type(boot_node)

  -- Copy the common README.md/LICENSE files, along with a
  -- chip-specific Makefile for GNU Make.
  local makefile_source_fn = 'Make_' .. chip_type
  local makefile_source_dir = 'static/node_code/boot/makefiles/'
  local makefile_source_path = makefile_source_dir .. makefile_source_fn
  local license_source_path = 'static/node_code/boot/LICENSE'
  local readme_source_path = 'static/node_code/boot/README.md'
  local makefile_dest_path = cur_proj_state.base_dir .. 'Makefile'
  local license_dest_path = cur_proj_state.base_dir .. 'LICENSE'
  local readme_dest_path = cur_proj_state.base_dir .. 'README.md'
  -- Copy files.
  if not varm_util.copy_text_file(makefile_source_path, makefile_dest_path) then
    return nil
  end
  if not varm_util.copy_text_file(license_source_path, license_dest_path) then
    return nil
  end
  if not varm_util.copy_text_file(readme_source_path, readme_dest_path) then
    return nil
  end
  -- This method just returns a 'build files generated/not generated' flag.
  return true
end

-- Process a single node in the FSM graph.
-- Return true if the processing succeeds, false if it doesn't.
function FSMNodes.process_node(node, node_graph, proj_state)
  -- Loading a node takes two steps.
  -- - First, we verify that all of the necessary utility methods/includes
  -- exist, and copy them into the project files if they aren't.
  -- - Second, we add the code to the end of the 'main' method. Like this:
  --     <This node's unique label>:
  --     <node code>
  --     GOTO <Next node's label>
  -- But this method will really just call other ones based on the node type.
  if (not node) or (not node.node_type) then
    return nil
  end
  if node.node_type == 'Boot' then
    if (FSMNodes.ensure_support_methods_boot_node(node, proj_state) and
        FSMNodes.append_boot_node(node, node_graph, proj_state)) then
      return true
    end
  elseif node.node_type == 'Delay' then
    if (FSMNodes.ensure_support_methods_delay_node(node, proj_state) and
        FSMNodes.append_delay_node(node, node_graph, proj_state)) then
      return true
    end
  elseif node.node_type == 'GPIO_Init' then
    if (FSMNodes.ensure_support_methods_gpio_init_node(node, proj_state) and
        FSMNodes.append_gpio_init_node(node, node_graph, proj_state)) then
      return true
    end
  elseif node.node_type == 'GPIO_Output' then
    if (FSMNodes.ensure_support_methods_gpio_output_node(node, proj_state) and
        FSMNodes.append_gpio_output_node(node, node_graph, proj_state)) then
      return true
    end
  end
  -- (Unrecognized node type.)
  return nil
end

-- Ensure that all of the supporting methods needed by the 'Boot'
-- node are present, and add any that aren't.
function FSMNodes.ensure_support_methods_boot_node(node, proj_state)
  -- The 'Boot' mode doesn't really need any supporting methods, right now.
  -- Everything is included in the 'init_project_state' method.
  return true
end

-- Append code to the 'main' method for the 'Boot' node.
function FSMNodes.append_boot_node(node, node_graph, proj_state)
  -- There's no real code needed for the 'Boot' node, but we still have
  -- to add a label for the node and a GOTO to make sure that the
  -- program starts with the right node.
  -- (Start with 'goto Boot', to avoid compiler warnings for an unused label.
  local node_text = '  // ("Boot" node, program entry point)\n'
  node_text = node_text .. '  goto NODE_' .. node.node_ind .. ';\n'
  node_text = node_text .. '  NODE_' .. node.node_ind .. ':\n'
  node_text = node_text .. '  // TODO: boot code?\n'
  if node.output and node.output.single then
    node_text = node_text .. '  goto NODE_' .. node.output.single .. ';\n'
  else
    return nil
  end
  node_text = node_text .. '  // (End "Boot" node)\n\n'
  if not varm_util.insert_into_file(proj_state.base_dir .. 'src/main.c',
                                    '/ MAIN_ENTRY:',
                                    node_text) then
    return nil
  end
  return true
end

-- Ensure that all of the supporting methods needed by a 'Delay'
-- node are present, and add any that aren't.
function FSMNodes.ensure_support_methods_delay_node(node, proj_state)
  -- The 'Delay' node requires a 'delay' assembly method, depending on
  -- the chosen units. We want to add the method to the 'util.S' method,
  -- define it in the 'global.h' file, and ... well I think that's it.
  -- 'util.S' declares.
  local util_s_insert_path = 'static/node_code/delay/src/util_S.insert'
  local global_h_insert_path = 'static/node_code/delay/src/global_h.insert'
  if not varm_util.copy_block_into_file(util_s_insert_path,
                                        proj_state.base_dir .. 'src/util.S',
                                        'UTIL_S_DELAY_CYCLES_DEC_START:',
                                        'UTIL_S_DELAY_CYCLES_DEC_DONE:',
                                        '/ ASM_GLOBAL_UTIL_DECLARES:') then
    return nil
  end
  -- 'util.S' defines.
  if not varm_util.copy_block_into_file(util_s_insert_path,
                                        proj_state.base_dir .. 'src/util.S',
                                        'UTIL_S_DELAY_CYCLES_DEF_START:',
                                        'UTIL_S_DELAY_CYCLES_DEF_DONE:',
                                        '/ ASM_GLOBAL_UTIL_DEFINES:') then
    return nil
  end
  -- 'global.h' declare.
  if not varm_util.copy_block_into_file(global_h_insert_path,
                                        proj_state.base_dir .. 'src/global.h',
                                        'GLOBAL_EXTERN_DELAY_CYCLES_START:',
                                        'GLOBAL_EXTERN_DELAY_CYCLES_DONE:',
                                        '/ ASM_METHOD_DEFINES:') then
    return nil
  end
  return true
end

-- Append code to the 'main' method for a 'Delay' node.
function FSMNodes.append_delay_node(node, node_graph, proj_state)
  local node_text = '  // ("Delay" node)\n'
  node_text = node_text .. '  NODE_' .. node.node_ind .. ':\n'
  -- Get the number of cycles to delay. TODO: Support other 'delay_units'.
  node_text = node_text .. '  delay_cycles('
  if node.options and node.options.delay_value then
    node_text = node_text .. node.options.delay_value .. ');\n'
  else
    node_text = node_text .. '0); // TODO: Default options\n'
  end
  if node.output and node.output.single then
    node_text = node_text .. '  goto NODE_' .. node.output.single .. ';\n'
  else
    return nil
  end
  node_text = node_text .. '  // (End "Delay" node)\n\n'
  if not varm_util.insert_into_file(proj_state.base_dir .. 'src/main.c',
                                    "/ MAIN_ENTRY:",
                                    node_text) then
    return nil
  end
  return true
end

-- Ensure that supporting methods for GPIO pin initialization are present.
-- TODO
function FSMNodes.ensure_support_methods_gpio_init_node(node, proj_state)
  return true
end

-- Append code to the 'main' method for a 'Setup GPIO Pin' node.
function FSMNodes.append_gpio_init_node(node, node_graph, proj_state)
  local node_text = '  // ("Setup GPIO Pin" node)\n'
  node_text = node_text .. '  NODE_' .. node.node_ind .. ':\n'
  node_text = node_text .. '  // TODO: GPIO pin initialization code\n'
  if node.output and node.output.single then
    node_text = node_text .. '  goto NODE_' .. node.output.single .. ';\n'
  else
    return nil
  end
  node_text = node_text .. '  // (End "Setup GPIO Pin" node)\n\n'
  if not varm_util.insert_into_file(proj_state.base_dir .. 'src/main.c',
                                    "/ MAIN_ENTRY:",
                                    node_text) then
    return nil
  end
  return true
end

-- Ensure that all necessary supporting functions for GPIO Output exist.
-- TODO
function FSMNodes.ensure_support_methods_gpio_output_node(node, proj_state)
  return true
end

-- Append code to the 'main' method for a 'Set GPIO Pin Output' node.
function FSMNodes.append_gpio_output_node(node, node_graph, proj_state)
  local node_text = '  // ("Set GPIO Output" node)\n'
  node_text = node_text .. '  NODE_' .. node.node_ind .. ':\n'
  node_text = node_text .. '  // TODO: GPIO pin output code\n'
  if node.output and node.output.single then
    node_text = node_text .. '  goto NODE_' .. node.output.single .. ';\n'
  else
    return nil
  end
  node_text = node_text .. '  // (End "Set GPIO Output" node)\n\n'
  if not varm_util.insert_into_file(proj_state.base_dir .. 'src/main.c',
                                    "/ MAIN_ENTRY:",
                                    node_text) then
    return nil
  end
  return true
end

return FSMNodes
