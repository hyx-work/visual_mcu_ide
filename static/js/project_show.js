// Shaders. We're only doing simple 2D drawing, so
// why even make separate files for them
const vert_sh = `#version 300 es
  precision mediump float;
  in vec2 vp;
  uniform   vec2 cur_view_coords;
  void main() {
    gl_Position = vec4(vp.x, vp.y, 0.0, 1.0);
  }
`;
const grid_frag_sh = `#version 300 es
  precision mediump float;
  // Inputs.
  uniform   float canvas_w;
  uniform   float canvas_h;
  uniform   vec2 cur_view_coords;
  // Output color.
  out       vec4 out_color;
  void main() {
    // Draw a 'pegboard' view. For now, no DPI settings or anything.
    // Just 64px per grid square.
    const int grid_spacing = 64;
    int cur_x = int(cur_view_coords.x);
    int cur_y = int(cur_view_coords.y);
    int x_mod = cur_x & 0x0000003F;
    int y_mod = cur_y & 0x0000003F;
    int cur_px_x = int(gl_FragCoord.x);
    int cur_px_x_mod = cur_px_x & 0x0000003F;
    cur_px_x_mod = 64-cur_px_x_mod;
    int cur_px_y = int(gl_FragCoord.y);
    int cur_px_y_mod = cur_px_y & 0x0000003F;
    cur_px_y_mod = 64-cur_px_y_mod;
    int is_grid_px = 0;
    const int grid_dot_size = 2;
    // Draw a larger dot at (0, 0) to get the coordinate system straight.
    // So, if x and y are within say, [-5, 5] including the offset.
    const int origin_dot = 5;
    if ((cur_x+cur_px_x >= -origin_dot && cur_x+cur_px_x <= origin_dot) &&
        (cur_y+cur_px_y >= -origin_dot && cur_y+cur_px_y <= origin_dot)) {
      is_grid_px = 1;
    }
    // For x,y in [0:dot_size], draw dot color if (cur_x % grid_size)
    // is within (dot_offset)+[0:dot_size].
    for (int x_prog = 0; x_prog < grid_dot_size; ++x_prog) {
      for (int y_prog = 0; y_prog < grid_dot_size; ++y_prog) {
        if ((x_mod+x_prog == cur_px_x_mod || x_mod+x_prog+64 == cur_px_x_mod)
            && (y_mod+y_prog == cur_px_y_mod || y_mod+y_prog+64 == cur_px_y_mod)) {
          is_grid_px = 1;
        }
      }
    }
    if (is_grid_px == 1) {
      out_color = vec4(0.5, 0.5, 0.5, 1.0);
    }
    else {
      out_color = vec4(1.0, 1.0, 1.0, 1.0);
    }
  }
`;

const node_frag_sh = `#version 300 es
  precision mediump float;
  // Struct definitions.
  struct FSM_Node {
    sampler2D tex_sampler;
    int node_status;
    int grid_coord_x;
    int grid_coord_y;
  };
  struct FSM_Conn {
    int start_coord_x;
    int start_coord_y;
    int end_coord_x;
    int end_coord_y;
  };
  // Inputs.
  uniform   float canvas_w;
  uniform   float canvas_h;
  uniform   vec2 cur_view_coords;
  uniform   FSM_Node cur_tool_node;
  // Output color.
  out       vec4 out_color;
  void main() {
    // Gather grid/view information.
    int cur_x = int(cur_view_coords.x);
    int cur_y = int(cur_view_coords.y);
    int cur_px_x = int(gl_FragCoord.x);
    int cur_px_y = int(gl_FragCoord.y);
    // Draw the supplied node.
    if (cur_tool_node.node_status >= 0) {
      // Find the right grid coordinate's location relative to the window.
      // The center will be at global (x*64, y*64), so:
      // (global_x-cur_view_x) = local center.
      int cur_tool_node_local_x = cur_tool_node.grid_coord_x * 64;
      cur_tool_node_local_x -= int(cur_view_coords.x);
      int cur_tool_node_local_y = cur_tool_node.grid_coord_y * 64;
      cur_tool_node_local_y -= int(cur_view_coords.y);
      int cur_tool_node_min_x = cur_tool_node_local_x - 32;
      int cur_tool_node_max_x = cur_tool_node_local_x + 32;
      int cur_tool_node_min_y = cur_tool_node_local_y - 32;
      int cur_tool_node_max_y = cur_tool_node_local_y + 32;
      if (cur_px_x >= cur_tool_node_min_x &&
          cur_px_x <= cur_tool_node_max_x &&
          cur_px_y >= cur_tool_node_min_y &&
          cur_px_y <= cur_tool_node_max_y) {
        // Texture coordinates are [0:1]; treat (grid_coord-32) as the 
        // '0' and (grid_coord+32) as the '1', for a 64-px grid.
        float cur_tool_s = float(cur_px_x - cur_tool_node_min_x);
        float cur_tool_t = float(cur_px_y - cur_tool_node_min_y);
        int stripes_check = int(cur_tool_s+cur_tool_t);
        const int stripes_w = 16;
        const int stripes_s = 4;
        cur_tool_s /= 64.0;
        cur_tool_t /= 64.0;
        cur_tool_t = 1.0 - cur_tool_t;
        vec2 cur_tool_st = vec2(cur_tool_s, cur_tool_t);
        if (cur_tool_node.node_status == 1) {
          // Apply a 'striping' transparency effect to indicate that this
          // node is in a temporary or transient state.
          if (stripes_check % stripes_w <= (stripes_w-stripes_s)/2 ||
              stripes_check % stripes_w >= stripes_w-(stripes_w-stripes_s)/2) {
            out_color = texture(cur_tool_node.tex_sampler, cur_tool_st);
          }
          else { discard; }
        }
        else {
          out_color = texture(cur_tool_node.tex_sampler, cur_tool_st);
        }
      }
      else { discard; }
    }
    else { discard; }
  }
`;

// 'Global' variables to use.
var selected_tool = "pan";
var selected_menu_tool = "";
var is_currently_panning = false;
var move_grabbed_node_id = -1;
var selected_node_id = -1;
var last_pan_mouse_x = -1;
var last_pan_mouse_y = -1;
var pan_scale_factor = 1.5;
var cur_fsm_x = 0;
var cur_fsm_y = 0;
var cur_fsm_grid_x = 0;
var cur_fsm_grid_y = 0;
var cur_fsm_mouse_x = 0;
var cur_fsm_mouse_y = 0;
var gl = null;
var grid_shader_prog = null;
var node_shader_prog = null;
var img_lock = false;
// Array for keeping track of FSM node structs to send to the shader.
var fsm_nodes = [];
// (Fields sent to the shaders)
var fsm_node_struct_fields = [
  "tex_sampler",
  "node_status",
  "grid_coord_x",
  "grid_coord_y",
];
// 'currently-selected preview' node info.
var cur_tool_node_tex = -1;
var cur_tool_node_type = '';
var cur_tool_node_grid_x = 0;
var cur_tool_node_grid_y = 0;
// Preloaded textures
var loaded_textures = [];

load_shader = function(gl, sh_type, sh_source) {
  const sh = gl.createShader(sh_type);
  gl.shaderSource(sh, sh_source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    alert("Error compiling shaders: " + gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
};

load_one_texture = function(tex_key, tex_path) {
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  var img = new Image();
  const mip_level = 0;
  const format = gl.RGBA;
  const src_type = gl.UNSIGNED_BYTE;
  // Dummy 1-pixel texture.
  gl.texImage2D(gl.TEXTURE_2D, mip_level, format, 1, 1, 0, format, src_type, new Uint8Array([0, 0, 255, 255]));
  img.onload = function() {
    while (!img.complete) {}
    while (img_lock) {}
    img_lock = true;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, mip_level, format, format, src_type, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    loaded_textures[tex_key] = tex;
    img_lock = false;
  };
  img.src = tex_path;
};

array_filter_nulls = function(x) {
  return (x != null);
}

preload_textures = function() {
  load_one_texture('Boot', '/static/fsm_assets/boot_node.png');
  load_one_texture('Delay', '/static/fsm_assets/delay_node.png');
  load_one_texture('GPIO_Init', '/static/fsm_assets/init_gpio_node.png');
  load_one_texture('GPIO_Deinit', '/static/fsm_assets/disable_pin_node.png');
  load_one_texture('GPIO_Output', '/static/fsm_assets/set_output_pin_node.png');
  load_one_texture('RCC_Enable', '/static/fsm_assets/enable_clock_node.png');
  load_one_texture('RCC_Disable', '/static/fsm_assets/disable_clock_node.png');
  load_one_texture('New_Variable', '/static/fsm_assets/new_var_node.png');
  load_one_texture('Set_Variable', '/static/fsm_assets/set_variable_node.png');
  // Sooo I mixed up 'LtoR' and 'RtoL' in the png filenames. But long-term,
  // these should be svg files anyways so just...ugh, TODO
  load_one_texture('left_arrow_blue', '/static/fsm_assets/conn_LtoR_blue.png');
  load_one_texture('right_arrow_blue', '/static/fsm_assets/conn_RtoL_blue.png');
  load_one_texture('down_arrow_blue', '/static/fsm_assets/conn_TtoB_blue.png');
  load_one_texture('up_arrow_blue', '/static/fsm_assets/conn_BtoT_blue.png');
  load_one_texture('left_arrow_green', '/static/fsm_assets/conn_LtoR_green.png');
  load_one_texture('right_arrow_green', '/static/fsm_assets/conn_RtoL_green.png');
  load_one_texture('down_arrow_green', '/static/fsm_assets/conn_TtoB_green.png');
  load_one_texture('up_arrow_green', '/static/fsm_assets/conn_BtoT_green.png');
};

check_selected_menu_tool = function() {
  var menu_tool_selected = false;
  // 'Boot' node.
  if (selected_menu_tool == 'Boot' && loaded_textures['Boot']) {
    cur_tool_node_tex = loaded_textures['Boot'];
    cur_tool_node_type = 'Boot';
    menu_tool_selected = true;
  }
  // 'Delay' node.
  else if (selected_menu_tool == 'Delay' && loaded_textures['Delay']) {
    cur_tool_node_tex = loaded_textures['Delay'];
    cur_tool_node_type = 'Delay';
    menu_tool_selected = true;
  }
  // 'GPIO Init' node; setup a GPIO pin.
  else if (selected_menu_tool == 'Setup GPIO Pin' && loaded_textures['GPIO_Init']) {
    cur_tool_node_tex = loaded_textures['GPIO_Init'];
    cur_tool_node_type = 'GPIO_Init';
    menu_tool_selected = true;
  }
  // 'GPIO Deinit' node; disable a previously-initialized GPIO pin.
  else if (selected_menu_tool == 'Disable GPIO Pin' && loaded_textures['GPIO_Deinit']) {
    cur_tool_node_tex = loaded_textures['GPIO_Deinit'];
    cur_tool_node_type = 'GPIO_Deinit';
    menu_tool_selected = true;
  }
  // 'GPIO Output' node; set a previously-setup GPIO output pin to 0 or 1.
  else if (selected_menu_tool == 'Write Output Pin' && loaded_textures['GPIO_Output']) {
    cur_tool_node_tex = loaded_textures['GPIO_Output'];
    cur_tool_node_type = 'GPIO_Output';
    menu_tool_selected = true;
  }
  // 'RCC Enable' node; enable a peripheral clock.
  else if (selected_menu_tool == 'Enable Peripheral Clock' && loaded_textures['RCC_Enable']) {
    cur_tool_node_tex = loaded_textures['RCC_Enable'];
    cur_tool_node_type = 'RCC_Enable';
    menu_tool_selected = true;
  }
  // 'RCC Disable' node; turn off a peripheral clock.
  else if (selected_menu_tool == 'Disable Peripheral Clock' && loaded_textures['RCC_Disable']) {
    cur_tool_node_tex = loaded_textures['RCC_Disable'];
    cur_tool_node_type = 'RCC_Disable';
    menu_tool_selected = true;
  }
  // 'New variable' node; define a variable. It's not 'new' as in
  // 'malloc', the C equivalent is just defining a variable in a
  // scope higher than the 'main' function. A 'global'
  else if (selected_menu_tool == 'Define Variable' && loaded_textures['New_Variable']) {
    cur_tool_node_tex = loaded_textures['New_Variable'];
    cur_tool_node_type = 'New_Variable';
    menu_tool_selected = true;
  }
  // 'Set variable' node; set a variable which was previously defined
  // with a 'Define Variable' node. TODO: support multiple variable scopes.
  // But that's a pretty long-term goal.
  else if (selected_menu_tool == 'Set Variable' && loaded_textures['Set_Variable']) {
    cur_tool_node_tex = loaded_textures['Set_Variable'];
    cur_tool_node_type = 'Set_Variable';
    menu_tool_selected = true;
  }
  // No match.
  else {
    cur_tool_node_tex = -1;
  }
  return menu_tool_selected;
};

init_fsm_layout_canvas = function() {
  const canvas = document.getElementById("fsm_layout_canvas");
  const canvas_container = document.getElementById("fsm_canvas_div");
  // Resize canvas to its parent div dimensions.
  canvas.width = canvas_container.offsetWidth;
  canvas.height = canvas_container.offsetHeight;

  // Initialize WebGL
  gl = canvas.getContext("webgl2");
  if (!gl) {
    alert("Cannot initialize WebGL context");
    return;
  }

  // Clear to sea-green.
  gl.clearColor(0.0, 0.9, 0.7, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Preload textures.
  preload_textures();

  // Load shaders.
  const vs = load_shader(gl, gl.VERTEX_SHADER, vert_sh);
  const grid_fs = load_shader(gl, gl.FRAGMENT_SHADER, grid_frag_sh);
  const node_fs = load_shader(gl, gl.FRAGMENT_SHADER, node_frag_sh);
  grid_shader_prog = gl.createProgram();
  node_shader_prog = gl.createProgram();
  gl.attachShader(grid_shader_prog, vs);
  gl.attachShader(grid_shader_prog, grid_fs);
  gl.linkProgram(grid_shader_prog);
  gl.attachShader(node_shader_prog, vs);
  gl.attachShader(node_shader_prog, node_fs);
  gl.linkProgram(node_shader_prog);
  if (!gl.getProgramParameter(grid_shader_prog, gl.LINK_STATUS)) {
    alert("Couldn't initialize grid shader program - log:\n" + gl.getProgramInfoLog(grid_shader_prog));
    return;
  }
  if (!gl.getProgramParameter(node_shader_prog, gl.LINK_STATUS)) {
    alert("Couldn't initialize node shader program - log:\n" + gl.getProgramInfoLog(node_shader_prog));
    return;
  }

  // Initialize buffer objects.
  const pos_buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pos_buffer);
  const pos_pts = [
    1.0, 1.0,
    -1.0, 1.0,
    1.0, -1.0,
    -1.0, -1.0,
  ];
  gl.bufferData(gl.ARRAY_BUFFER,
                new Float32Array(pos_pts),
                gl.STATIC_DRAW);

  // Setup the scene.
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Define positions buffer.
  gl.bindBuffer(gl.ARRAY_BUFFER, pos_buffer);
  gl.vertexAttribPointer(gl.getAttribLocation(grid_shader_prog, 'vp'),
                         2, // number of components
                         gl.FLOAT,
                         false, // normalize?
                         0, 0);
  gl.enableVertexAttribArray(gl.getAttribLocation(grid_shader_prog, 'vp'));
  gl.vertexAttribPointer(gl.getAttribLocation(node_shader_prog, 'vp'),
                         2, // number of components
                         gl.FLOAT,
                         false,
                         0, 0);
  gl.enableVertexAttribArray(gl.getAttribLocation(node_shader_prog, 'vp'));

  // Use the current shader program.
  gl.useProgram(grid_shader_prog);

  // Pre-fill FSM node arrays with null values.
  for (var node_ind = 0; node_ind < 256; ++node_ind) {
    fsm_nodes[node_ind] = null;
  }

  // Draw.
  redraw_canvas();
};

redraw_canvas = function() {
  gl.clear(gl.COLOR_BUFFER_BIT);

  const canvas = document.getElementById("fsm_layout_canvas");

  // First, draw the 'grid' view.
  gl.useProgram(grid_shader_prog);

  // Send uniform values.
  gl.uniform1f(gl.getUniformLocation(grid_shader_prog, 'canvas_w'), canvas.width);
  gl.uniform1f(gl.getUniformLocation(grid_shader_prog, 'canvas_h'), canvas.height);
  gl.uniform2fv(gl.getUniformLocation(grid_shader_prog, 'cur_view_coords'), [cur_fsm_x, cur_fsm_y]);

  // Draw.
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Next, draw any nodes that are within the current view.
  var grid_min_x = cur_fsm_grid_x - 1;
  var grid_min_y = cur_fsm_grid_y - 1;
  var grid_max_x = cur_fsm_grid_x + parseInt(canvas.width/64) + 1;
  var grid_max_y = cur_fsm_grid_y + parseInt(canvas.height/64) + 1;
  for (var node_ind = 0; node_ind < 256; ++node_ind) {
    if (fsm_nodes[node_ind] && fsm_nodes[node_ind].node_status != -1 &&
        (fsm_nodes[node_ind].grid_coord_x >= grid_min_x &&
         fsm_nodes[node_ind].grid_coord_x <= grid_max_x &&
         fsm_nodes[node_ind].grid_coord_y >= grid_min_y &&
         fsm_nodes[node_ind].grid_coord_y <= grid_max_y)) {
      gl.useProgram(node_shader_prog);
      // Bind texture.
      gl.bindTexture(gl.TEXTURE_2D, fsm_nodes[node_ind].tex_sampler);
      // Send uniform values.
      gl.uniform1f(gl.getUniformLocation(node_shader_prog, 'canvas_w'), canvas.width);
      gl.uniform1f(gl.getUniformLocation(node_shader_prog, 'canvas_h'), canvas.height);
      gl.uniform2fv(gl.getUniformLocation(node_shader_prog, 'cur_view_coords'), [cur_fsm_x, cur_fsm_y]);
      gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.tex_sampler'), fsm_nodes[node_ind].tex_sampler);
      // TODO: Handle 'node_status' properly...
      if (move_grabbed_node_id == node_ind) {
        gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.node_status'), 1);
      }
      else {
        gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.node_status'), fsm_nodes[node_ind].node_status);
      }
      gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.grid_coord_x'), fsm_nodes[node_ind].grid_coord_x);
      gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.grid_coord_y'), fsm_nodes[node_ind].grid_coord_y);
      // Draw.
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  // Finally, draw the currently-selected tool node if applicable.
  if (selected_tool == 'tool' && cur_tool_node_tex != -1) {
    gl.useProgram(node_shader_prog);
    // Bind texture.
    gl.bindTexture(gl.TEXTURE_2D, cur_tool_node_tex);
    // Send uniform values.
    gl.uniform1f(gl.getUniformLocation(node_shader_prog, 'canvas_w'), canvas.width);
    gl.uniform1f(gl.getUniformLocation(node_shader_prog, 'canvas_h'), canvas.height);
    gl.uniform2fv(gl.getUniformLocation(node_shader_prog, 'cur_view_coords'), [cur_fsm_x, cur_fsm_y]);
    gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.tex_sampler'), cur_tool_node_tex);
    gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.node_status'), 1);
    gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.grid_coord_x'), cur_tool_node_grid_x);
    gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.grid_coord_y'), cur_tool_node_grid_y);
    // Draw.
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  else if (selected_tool == 'move_grabbed') {
    if (move_grabbed_node_id >= 0 &&
        fsm_nodes[move_grabbed_node_id]) {
      var half_grid = 32;
      if (cur_fsm_x+cur_fsm_mouse_x < 0) { half_grid = -32; }
      var cur_node_grid_x = parseInt((cur_fsm_x+cur_fsm_mouse_x+half_grid)/64);
      if (cur_fsm_y+cur_fsm_mouse_y < 0) { half_grid = -32; }
      else { half_grid = 32; }
      var cur_node_grid_y = parseInt((cur_fsm_y+cur_fsm_mouse_y+half_grid)/64);
      gl.useProgram(node_shader_prog);
      // Bind texture.
      gl.bindTexture(gl.TEXTURE_2D, fsm_nodes[move_grabbed_node_id].tex_sampler);
      // Send uniform values.
      gl.uniform1f(gl.getUniformLocation(node_shader_prog, 'canvas_w'), canvas.width);
      gl.uniform1f(gl.getUniformLocation(node_shader_prog, 'canvas_h'), canvas.height);
      gl.uniform2fv(gl.getUniformLocation(node_shader_prog, 'cur_view_coords'), [cur_fsm_x, cur_fsm_y]);
      gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.tex_sampler'), fsm_nodes[move_grabbed_node_id].tex_sampler);
      gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.node_status'), 1);
      gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.grid_coord_x'), cur_node_grid_x);
      gl.uniform1i(gl.getUniformLocation(node_shader_prog, 'cur_tool_node.grid_coord_y'), cur_node_grid_y);
      // Draw.
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
};

project_show_onload = function() {
  init_fsm_layout_canvas();

  // Input handling from HTML GUI.
  // Main 'tool select' buttons.
  var pointer_tool_btn = document.getElementById("pointer_tool_select");
  pointer_tool_btn.addEventListener('click', function(e) {
    selected_tool = 'pointer';
    // Update stylings.
    $("#pointer_tool_select").removeClass("btn-primary");
    $("#pointer_tool_select").addClass("btn-success");
    $("#pan_tool_select").addClass("btn-primary");
    $("#pan_tool_select").removeClass("btn-success");
    $("#tool_tool_select").addClass("btn-primary");
    $("#tool_tool_select").removeClass("btn-success");
    $("#move_tool_select").addClass("btn-primary");
    $("#move_tool_select").removeClass("btn-success");
    $("#delete_tool_select").addClass("btn-primary");
    $("#delete_tool_select").removeClass("btn-success");
    $("#fsm_canvas_div").addClass("hobb_layout_pointer_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_pan_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_pan_tool_down");
    $("#fsm_canvas_div").removeClass("hobb_layout_tool_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_move_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_move_tool_grabbed");
    $("#fsm_canvas_div").removeClass("hobb_layout_delete_tool");
    last_pan_mouse_x = -1;
    last_pan_mouse_y = -1;
    cur_fsm_mouse_x = 0;
    cur_fsm_mouse_y = 0;
    move_grabbed_node_id = -1;
    redraw_canvas();
  });
  document.getElementById("pan_tool_select").addEventListener("click", function(e) {
    selected_tool = 'pan';
    // Update stylings.
    $("#pan_tool_select").removeClass("btn-primary");
    $("#pan_tool_select").addClass("btn-success");
    $("#pointer_tool_select").addClass("btn-primary");
    $("#pointer_tool_select").removeClass("btn-success");
    $("#tool_tool_select").addClass("btn-primary");
    $("#tool_tool_select").removeClass("btn-success");
    $("#move_tool_select").addClass("btn-primary");
    $("#move_tool_select").removeClass("btn-success");
    $("#delete_tool_select").addClass("btn-primary");
    $("#delete_tool_select").removeClass("btn-success");
    $("#fsm_canvas_div").removeClass("hobb_layout_pointer_tool");
    $("#fsm_canvas_div").addClass("hobb_layout_pan_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_pan_tool_down");
    $("#fsm_canvas_div").removeClass("hobb_layout_tool_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_move_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_move_tool_grabbed");
    $("#fsm_canvas_div").removeClass("hobb_layout_delete_tool");
    last_pan_mouse_x = -1;
    last_pan_mouse_y = -1;
    cur_fsm_mouse_x = 0;
    cur_fsm_mouse_y = 0;
    move_grabbed_node_id = -1;
    redraw_canvas();
  });
  document.getElementById("tool_tool_select").addEventListener("click", function(e) {
    selected_tool = 'tool';
    // Update stylings.
    $("#tool_tool_select").removeClass("btn-primary");
    $("#tool_tool_select").addClass("btn-success");
    $("#pan_tool_select").addClass("btn-primary");
    $("#pan_tool_select").removeClass("btn-success");
    $("#pointer_tool_select").addClass("btn-primary");
    $("#pointer_tool_select").removeClass("btn-success");
    $("#move_tool_select").addClass("btn-primary");
    $("#move_tool_select").removeClass("btn-success");
    $("#delete_tool_select").addClass("btn-primary");
    $("#delete_tool_select").removeClass("btn-success");
    $("#fsm_canvas_div").removeClass("hobb_layout_pointer_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_pan_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_pan_tool_down");
    $("#fsm_canvas_div").addClass("hobb_layout_tool_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_move_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_move_tool_grabbed");
    $("#fsm_canvas_div").removeClass("hobb_layout_delete_tool");
    last_pan_mouse_x = -1;
    last_pan_mouse_y = -1;
    cur_fsm_mouse_x = 0;
    cur_fsm_mouse_y = 0;
    move_grabbed_node_id = -1;
    redraw_canvas();
  });
  document.getElementById("move_tool_select").addEventListener("click", function(e) {
    selected_tool = 'move';
    // Update stylings.
    $("#tool_tool_select").addClass("btn-primary");
    $("#tool_tool_select").removeClass("btn-success");
    $("#pan_tool_select").addClass("btn-primary");
    $("#pan_tool_select").removeClass("btn-success");
    $("#pointer_tool_select").addClass("btn-primary");
    $("#pointer_tool_select").removeClass("btn-success");
    $("#move_tool_select").removeClass("btn-primary");
    $("#move_tool_select").addClass("btn-success");
    $("#delete_tool_select").addClass("btn-primary");
    $("#delete_tool_select").removeClass("btn-success");
    $("#fsm_canvas_div").removeClass("hobb_layout_pointer_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_pan_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_pan_tool_down");
    $("#fsm_canvas_div").removeClass("hobb_layout_tool_tool");
    $("#fsm_canvas_div").addClass("hobb_layout_move_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_move_tool_grabbed");
    $("#fsm_canvas_div").removeClass("hobb_layout_delete_tool");
    last_pan_mouse_x = -1;
    last_pan_mouse_y = -1;
    cur_fsm_mouse_x = 0;
    cur_fsm_mouse_y = 0;
    move_grabbed_node_id = -1;
    redraw_canvas();
  });
  document.getElementById("delete_tool_select").addEventListener("click", function(e) {
    selected_tool = 'delete';
    // Update stylings.
    $("#tool_tool_select").addClass("btn-primary");
    $("#tool_tool_select").removeClass("btn-success");
    $("#pan_tool_select").addClass("btn-primary");
    $("#pan_tool_select").removeClass("btn-success");
    $("#pointer_tool_select").addClass("btn-primary");
    $("#pointer_tool_select").removeClass("btn-success");
    $("#move_tool_select").addClass("btn-primary");
    $("#move_tool_select").removeClass("btn-success");
    $("#delete_tool_select").removeClass("btn-primary");
    $("#delete_tool_select").addClass("btn-success");
    $("#fsm_canvas_div").removeClass("hobb_layout_pointer_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_pan_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_pan_tool_down");
    $("#fsm_canvas_div").removeClass("hobb_layout_tool_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_move_tool");
    $("#fsm_canvas_div").removeClass("hobb_layout_move_tool_grabbed");
    $("#fsm_canvas_div").addClass("hobb_layout_delete_tool");
    last_pan_mouse_x = -1;
    last_pan_mouse_y = -1;
    cur_fsm_mouse_x = 0;
    cur_fsm_mouse_y = 0;
    move_grabbed_node_id = -1;
    redraw_canvas();
  });

  // Add a global 'resize' event for the whole window.
  document.getElementById("varm_body_tag").onresize = function() {
    // Update uniform values and send to the shader.
    const canvas = document.getElementById("fsm_layout_canvas");
    const canvas_container = document.getElementById("fsm_canvas_div");
    canvas.width = canvas_container.offsetWidth;
    canvas.height = canvas_container.offsetHeight;
    // Re-draw.
    redraw_canvas();
  };

  // Add a 'mouse up' event on the whole window.
  document.getElementById("varm_body_tag").onmouseup = function(e) {
    if (selected_tool == 'pan') {
      is_currently_panning = false;
      $("#fsm_canvas_div").addClass("hobb_layout_pan_tool");
      $("#fsm_canvas_div").removeClass("hobb_layout_pan_tool_down");
      last_pan_mouse_x = -1;
      last_pan_mouse_y = -1;
      // Un-select any text that may have been selected if panning
      // dragged outside of the WebGL window.
      if (document.selected) {
        document.selected.empty();
      }
      else if (window.getSelection()) {
        window.getSelection().removeAllRanges();
      }
    }
  };

  // Add a 'mouse down' event for the FSM webGL div.
  document.getElementById("fsm_canvas_div").onmousedown = function(e) {
    if (selected_tool == 'pan') {
      is_currently_panning = true;
      $("#fsm_canvas_div").removeClass("hobb_layout_pan_tool");
      $("#fsm_canvas_div").addClass("hobb_layout_pan_tool_down");
      last_pan_mouse_x = e.clientX;
      last_pan_mouse_y = e.clientY;
    }
  }

  // Add a 'mouse moved' event on the whole window.
  document.getElementById("varm_body_tag").onmousemove = function(e) {
    if (selected_tool == 'pan' && is_currently_panning) {
      if (last_pan_mouse_x != -1 && last_pan_mouse_y != -1) {
        var diff_x = e.clientX - last_pan_mouse_x;
        var diff_y = e.clientY - last_pan_mouse_y;
        cur_fsm_x += (diff_x * pan_scale_factor);
        cur_fsm_y -= (diff_y * pan_scale_factor);
        cur_fsm_grid_x = parseInt(cur_fsm_x / 64);
        cur_fsm_grid_y = parseInt(cur_fsm_y / 64);

        // Submit the 'moved' coordinates to the shaders and re-draw.
        redraw_canvas();
        // Debug:
        //document.getElementById("list_current_fsm_coords").innerHTML = ("FSM Co-ords (bottom-left): (" + cur_fsm_x + ", " + cur_fsm_y + ")");
        //document.getElementById("list_current_fsm_grid_coords").innerHTML = ("= Grid Coordinates: (" + cur_fsm_grid_x + ", " + cur_fsm_grid_y + ")");
      }
      last_pan_mouse_x = e.clientX;
      last_pan_mouse_y = e.clientY;
    }
  };

  // Add a 'mouse moved' event on the webGL view. For now, this will just
  // be used for the tool tool, to render the prospective node before
  // placement.
  document.getElementById("fsm_canvas_div").onmousemove = function(e) {
    // Record current mouse dimensions. Use bottom-left as origin,
    // to match the WebGL conventions.
    cur_fsm_mouse_x = e.clientX;
    cur_fsm_mouse_y = e.clientY;
    var canvas_bounding_box = document.getElementById("fsm_canvas_div").getBoundingClientRect();
    cur_fsm_mouse_x -= canvas_bounding_box.left;
    cur_fsm_mouse_y -= canvas_bounding_box.bottom;
    cur_fsm_mouse_x = parseInt(cur_fsm_mouse_x);
    cur_fsm_mouse_y = parseInt(-cur_fsm_mouse_y);

    if (selected_tool == 'tool') {
      var menu_tool_selected = check_selected_menu_tool();
      // If there is a texture for the selection, find its grid coord.
      // (So, x/y coordinates / 64. (or whatever dot distance if it changes)
      if (menu_tool_selected) {
        var half_grid = 32;
        if (cur_fsm_x+cur_fsm_mouse_x < 0) { half_grid = -32; }
        cur_tool_node_grid_x = parseInt((cur_fsm_x+cur_fsm_mouse_x+half_grid)/64);
        if (cur_fsm_y+cur_fsm_mouse_y < 0) { half_grid = -32; }
        else { half_grid = 32; }
        cur_tool_node_grid_y = parseInt((cur_fsm_y+cur_fsm_mouse_y+half_grid)/64);
        //document.getElementById("list_last_fsm_tool_coords").innerHTML = ("Last FSM tool grid coordinates: (" + cur_tool_node_grid_x + ", " + cur_tool_node_grid_y + ")");
      }
    }
    //document.getElementById("list_last_fsm_mouse_coords").innerHTML = ("Last FSM grid mouse coordinates: (" + cur_fsm_mouse_x + ", " + cur_fsm_mouse_y + ")");
    // Redraw the canvas.
    redraw_canvas();
  };

  // Add a master 'on click' function for the FSM canvas.
  document.getElementById("fsm_canvas_div").onclick = function(e) {
    if (selected_tool == 'pointer') {
      // Get the grid coordinate closest to the current cursor.
      var half_grid = 32;
      if (cur_fsm_x+cur_fsm_mouse_x < 0) { half_grid = -32; }
      var cur_node_grid_x = parseInt((cur_fsm_x+cur_fsm_mouse_x+half_grid)/64);
      if (cur_fsm_y+cur_fsm_mouse_y < 0) { half_grid = -32; }
      else { half_grid = 32; }
      var cur_node_grid_y = parseInt((cur_fsm_y+cur_fsm_mouse_y+half_grid)/64);
      // If there is a node underneath the cursor, select it.
      var node_selected = false;
      for (var node_ind = 0; node_ind < 256; ++node_ind) {
        if (fsm_nodes[node_ind]) {
          if (fsm_nodes[node_ind].grid_coord_x == cur_node_grid_x &&
              fsm_nodes[node_ind].grid_coord_y == cur_node_grid_y) {
            node_selected = true;
            selected_node_id = node_ind;
            var sel_type = fsm_nodes[selected_node_id].node_type;
            document.getElementById("hobb_options_header").innerHTML = ("Options: (" + sel_type + ")");
            // In/Out connections table.
            var selected_node_options_html = node_io_options_html;
            // Type-specific options:
            if (sel_type == 'Boot') {
              selected_node_options_html += boot_node_options_html;
            }
            else if (sel_type == 'Delay') {
              selected_node_options_html += delay_node_options_html;
            }
            else if (sel_type == 'GPIO_Init') {
              selected_node_options_html += init_gpio_node_options_html;
            }
            else if (sel_type == 'GPIO_Deinit') {
              selected_node_options_html += deinit_gpio_node_options_html;
            }
            else if (sel_type == 'GPIO_Output') {
              selected_node_options_html += set_gpio_out_node_options_html;
            }
            else if (sel_type == 'RCC_Enable') {
              selected_node_options_html += rcc_enable_node_options_html;
            }
            else if (sel_type == 'RCC_Disable') {
              selected_node_options_html += rcc_disable_node_options_html;
            }
            else if (sel_type == 'New_Variable') {
              selected_node_options_html += define_var_node_options_html;
            }
            else if (sel_type == 'Set_Variable') {
              selected_node_options_html += set_var_node_options_html;
            }
            document.getElementById("hobb_options_content").innerHTML = selected_node_options_html;
            break;
          }
        }
      }
      // If not, Deselect.
      if (!node_selected) {
        selected_node_id = -1;
        document.getElementById("hobb_options_header").innerHTML = ("Options: (None)");
        document.getElementById("hobb_options_content").innerHTML = "";
      }
    }
    else if (selected_tool == 'tool') {
      var menu_tool_selected = check_selected_menu_tool();
      // If there is a texture for the selection, find its grid coord.
      // (So, x/y coordinates / 64. (or whatever dot distance if it changes)
      if (menu_tool_selected) {
        var half_grid = 32;
        if (cur_fsm_x+cur_fsm_mouse_x < 0) { half_grid = -32; }
        cur_tool_node_grid_x = parseInt((cur_fsm_x+cur_fsm_mouse_x+half_grid)/64);
        if (cur_fsm_y+cur_fsm_mouse_y < 0) { half_grid = -32; }
        else { half_grid = 32; }
        cur_tool_node_grid_y = parseInt((cur_fsm_y+cur_fsm_mouse_y+half_grid)/64);
        //document.getElementById("list_last_fsm_tool_coords").innerHTML = ("Last FSM tool grid coordinates: (" + cur_tool_node_grid_x + ", " + cur_tool_node_grid_y + ")");
      }
      // Add the current tool node to the list, unless there is a
      // node in the proposed coordinates already.
      var already_populated = false;
      var index_to_use = -1;
      for (var node_ind = 0; node_ind < 256; ++node_ind) {
        if (fsm_nodes[node_ind]) {
          if (fsm_nodes[node_ind].grid_coord_x == cur_tool_node_grid_x &&
              fsm_nodes[node_ind].grid_coord_y == cur_tool_node_grid_y) {
            already_populated = true;
          }
          // Only allow one 'Boot' node. TODO: How to handle this?
          // For now, just don't place any more than one 'Boot' node.
          if (fsm_nodes[node_ind].node_type == 'Boot' &&
              cur_tool_node_type == 'Boot') {
            already_populated = true;
          }
        }
        else {
          if (index_to_use == -1) {
            index_to_use = node_ind;
          }
        }
      }
      if (!already_populated) {
        // Place a new node.
        fsm_nodes[index_to_use] = [];
        fsm_nodes[index_to_use].tex_sampler = cur_tool_node_tex;
        fsm_nodes[index_to_use].node_type = cur_tool_node_type;
        fsm_nodes[index_to_use].node_status = 0;
        fsm_nodes[index_to_use].grid_coord_x = cur_tool_node_grid_x;
        fsm_nodes[index_to_use].grid_coord_y = cur_tool_node_grid_y;
      }

      // Re-draw the canvas to show the placed node.
      redraw_canvas();
    }
    else if (selected_tool == 'delete') {
      var half_grid = 32;
      if (cur_fsm_x+cur_fsm_mouse_x < 0) { half_grid = -32; }
      var cur_node_grid_x = parseInt((cur_fsm_x+cur_fsm_mouse_x+half_grid)/64);
      if (cur_fsm_y+cur_fsm_mouse_y < 0) { half_grid = -32; }
      else { half_grid = 32; }
      var cur_node_grid_y = parseInt((cur_fsm_y+cur_fsm_mouse_y+half_grid)/64);
      // If there is a node on the current grid coordinate, delete it.
      for (var node_ind = 0; node_ind < 256; ++node_ind) {
        if (fsm_nodes[node_ind]) {
          if (fsm_nodes[node_ind].grid_coord_x == cur_node_grid_x &&
              fsm_nodes[node_ind].grid_coord_y == cur_node_grid_y) {
            // (Un-select the node if deleting the current selection.)
            if (selected_node_id == node_ind) {
              selected_node_id = -1;
              document.getElementById("hobb_options_header").innerHTML = ("Options: (None)");
              document.getElementById("hobb_options_content").innerHTML = "";
            }
            fsm_nodes[node_ind] = null;
            fsm_nodes = fsm_nodes.filter(array_filter_nulls);
          }
        }
      }

      // Re-draw the canvas.
      redraw_canvas();
    }
    else if (selected_tool == 'move') {
      var half_grid = 32;
      if (cur_fsm_x+cur_fsm_mouse_x < 0) { half_grid = -32; }
      var cur_node_grid_x = parseInt((cur_fsm_x+cur_fsm_mouse_x+half_grid)/64);
      if (cur_fsm_y+cur_fsm_mouse_y < 0) { half_grid = -32; }
      else { half_grid = 32; }
      var cur_node_grid_y = parseInt((cur_fsm_y+cur_fsm_mouse_y+half_grid)/64);
      // If there is a node on the currently-selected grid node, pick it up.
      var node_to_grab = -1;
      for (var node_ind = 0; node_ind < 256; ++node_ind) {
        if (fsm_nodes[node_ind]) {
          if (fsm_nodes[node_ind].grid_coord_x == cur_node_grid_x &&
              fsm_nodes[node_ind].grid_coord_y == cur_node_grid_y) {
            node_to_grab = node_ind;
            break;
          }
        }
      }
      if (node_to_grab != -1) {
        move_grabbed_node_id = node_to_grab;
        selected_tool = 'move_grabbed';
        $("#fsm_canvas_div").removeClass("hobb_layout_move_tool");
        $("#fsm_canvas_div").addClass("hobb_layout_move_tool_grabbed");
        // Re-draw the canvas.
        redraw_canvas();
      }
    }
    else if (selected_tool == 'move_grabbed') {
      var half_grid = 32;
      if (cur_fsm_x+cur_fsm_mouse_x < 0) { half_grid = -32; }
      var cur_node_grid_x = parseInt((cur_fsm_x+cur_fsm_mouse_x+half_grid)/64);
      if (cur_fsm_y+cur_fsm_mouse_y < 0) { half_grid = -32; }
      else { half_grid = 32; }
      var cur_node_grid_y = parseInt((cur_fsm_y+cur_fsm_mouse_y+half_grid)/64);
      var node_dropped = true;
      if (move_grabbed_node_id >= 0) {
        // If there is a 'grabbed' node, and if the currently-selected
        // grid node is empty, drop the grabbed node. Allow re-dropping
        // a node on the square that it previously occupied.
        for (var node_ind = 0; node_ind < 256; ++node_ind) {
          if (fsm_nodes[node_ind]) {
            if (fsm_nodes[node_ind].grid_coord_x == cur_node_grid_x &&
                fsm_nodes[node_ind].grid_coord_y == cur_node_grid_y &&
                node_ind != move_grabbed_node_id) {
              node_dropped = false;
            }
          }
        }
      }
      if (node_dropped) {
        if (move_grabbed_node_id >= 0 && fsm_nodes[move_grabbed_node_id]) {
          fsm_nodes[move_grabbed_node_id].grid_coord_x = cur_node_grid_x;
          fsm_nodes[move_grabbed_node_id].grid_coord_y = cur_node_grid_y;
        }
        selected_tool = 'move'
        move_grabbed_node_id = -1;
        $("#fsm_canvas_div").addClass("hobb_layout_move_tool");
        $("#fsm_canvas_div").removeClass("hobb_layout_move_tool_grabbed");
        // Re-draw the canvas.
        redraw_canvas();
      }
    }
  };
};
