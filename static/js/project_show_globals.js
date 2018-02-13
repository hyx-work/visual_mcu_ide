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
var imgs_loaded = 0;
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
var cur_tool_node_color = 'green';
var cur_tool_node_type = '';
var cur_tool_node_grid_x = 0;
var cur_tool_node_grid_y = 0;
// Preloaded textures
var loaded_textures = [];
// Global FSM program variables.
var mcu_chip = 'STM32F030F4';
var defined_vars = [];
// JSON struct representing a precompiled program.
var json_fsm_nodes = null;
// TODO: Shouldn't this be an array of strings, and a .length()?
var imgs_to_load = {
  Boot:              '/static/fsm_assets/boot_node.png',
  Delay:             '/static/fsm_assets/delay_node.png',
  Label:             '/static/fsm_assets/label_node.png',
  Jump:              '/static/fsm_assets/jump_node.png',
  GPIO_Init:         '/static/fsm_assets/init_gpio_node.png',
  GPIO_Output:       '/static/fsm_assets/set_output_pin_node.png',
  RCC_Enable:        '/static/fsm_assets/enable_clock_node.png',
  RCC_Disable:       '/static/fsm_assets/disable_clock_node.png',
  New_Variable:      '/static/fsm_assets/new_var_node.png',
  Set_Variable:      '/static/fsm_assets/set_variable_node.png',
  Set_Var_Logic_Not: '/static/fsm_assets/set_not_node.png',
  Nop_Node:          '/static/fsm_assets/no_op_node.png',
  // Branching nodes:
  Check_Truthy:      '/static/fsm_assets/check_truthy_node.png',
  // Sooo I mixed up 'LtoR' and 'RtoL' in the png filenames. But long-term,
  // these should be svg files anyways so just...ugh, TODO
  left_arrow_blue:   '/static/fsm_assets/conn_LtoR_blue.png',
  right_arrow_blue:  '/static/fsm_assets/conn_RtoL_blue.png',
  up_arrow_blue:     '/static/fsm_assets/conn_BtoT_blue.png',
  down_arrow_blue:   '/static/fsm_assets/conn_TtoB_blue.png',
  left_arrow_green:   '/static/fsm_assets/conn_LtoR_green.png',
  right_arrow_green:  '/static/fsm_assets/conn_RtoL_green.png',
  up_arrow_green:     '/static/fsm_assets/conn_BtoT_green.png',
  down_arrow_green:   '/static/fsm_assets/conn_TtoB_green.png',
  left_arrow_canary:   '/static/fsm_assets/conn_LtoR_canary.png',
  right_arrow_canary:  '/static/fsm_assets/conn_RtoL_canary.png',
  up_arrow_canary:     '/static/fsm_assets/conn_BtoT_canary.png',
  down_arrow_canary:   '/static/fsm_assets/conn_TtoB_canary.png',
  left_arrow_pink:   '/static/fsm_assets/conn_LtoR_pink.png',
  right_arrow_pink:  '/static/fsm_assets/conn_RtoL_pink.png',
  up_arrow_pink:     '/static/fsm_assets/conn_BtoT_pink.png',
  down_arrow_pink:   '/static/fsm_assets/conn_TtoB_pink.png',
};
var num_imgs = 0;

// Global FSM program constants.
// (Available 'tool' nodes. These are the FSM building blocks.)
const tool_node_types = [
{
  base_name: 'Boot',
  menu_name: 'Boot',
  node_color: 'green',
  default_options: {
    chip_type: 'STM32F030F4',
  },
  options_listeners: apply_boot_node_options_listeners,
  options_html: boot_node_options_html,
},
{
  base_name: 'Delay',
  menu_name: 'Delay',
  node_color: 'blue',
  default_options: {
    delay_unit: 'cycles',
    delay_value: 0,
  },
  options_listeners: apply_delay_node_options_listeners,
  options_html: delay_node_options_html,
},
{
  base_name: 'Label',
  menu_name: 'Label',
  node_color: 'pink',
  default_options: {
    label_name: '',
    label_display_name: '',
  },
  options_listeners: apply_label_node_options_listeners,
  options_html: label_node_options_html,
},
{
  base_name: 'Jump',
  menu_name: 'Jump',
  node_color: 'pink',
  default_options: {
    label_name: '(None)',
  },
  options_listeners: apply_jump_node_options_listeners,
  options_html: jump_node_options_html,
},
{
  base_name: 'GPIO_Init',
  menu_name: 'Setup GPIO Pin',
  node_color: 'green',
  default_options: {
    gpio_bank:   'GPIOA',
    gpio_pin:    0,
    gpio_func:   'Output',
    gpio_otype:  'Push-Pull',
    gpio_ospeed: 'H',
    gpio_pupdr:  'PU',
  },
  options_listeners: apply_gpio_init_options_listeners,
  options_html: init_gpio_node_options_html,
},
{
  base_name: 'GPIO_Output',
  menu_name: 'Write Output Pin',
  node_color: 'blue',
  default_options: {
    gpio_bank: 'GPIOA',
    gpio_pin:  0,
    gpio_val:  0,
  },
  options_listeners: apply_gpio_output_options_listeners,
  options_html: set_gpio_out_node_options_html,
},
{
  base_name: 'RCC_Enable',
  menu_name: 'Enable Peripheral Clock',
  node_color: 'green',
  default_options: {
    periph_clock: 'GPIOA',
  },
  options_listeners: apply_rcc_enable_node_options_listeners,
  options_html: rcc_enable_node_options_html,
},
{
  base_name: 'RCC_Disable',
  menu_name: 'Disable Peripheral Clock',
  node_color: 'pink',
  default_options: {
    periph_clock: 'GPIOA',
  },
  options_listeners: apply_rcc_disable_node_options_listeners,
  options_html: rcc_disable_node_options_html,
},
{
  base_name: 'New_Variable',
  menu_name: 'Define Variable',
  node_color: 'green',
  default_options: {
    var_name: '',
    var_display_name: '',
    var_type: 'int',
    var_val: 0,
  },
  options_listeners: apply_new_var_node_options_listeners,
  options_html: define_var_node_options_html,
},
{
  base_name: 'Set_Variable',
  menu_name: 'Set Variable',
  node_color: 'blue',
  default_options: {
    var_name: '(None)',
  },
  options_listeners: apply_set_var_node_options_listeners,
  options_html: set_var_node_options_html,
},
// TODO: Set_Var_Logic_Not
{
  base_name: 'Nop_Node',
  menu_name: 'No-op (Do Nothing)',
  node_color: 'blue',
  default_options: {
  },
  options_listeners: apply_nop_node_options_listeners,
  options_html: nop_node_options_html,
},
{
  base_name: 'Check_Truthy',
  menu_name: 'Is Variable Truth-y?',
  node_color: 'canary',
  default_options: {
    var_name: '(None)',
  },
  options_listeners: apply_check_truthy_options_listeners,
  options_html: check_truthy_node_options_html,
},
/*
{
  base_name: 'Delay',
  menu_name: 'Delay',
  node_color: 'blue',
  default_options: {
  },
  options_listeners: null,
  options_html: null,
},
*/
];

// (Available RCC peripheral clocks.)
const rcc_opts = {
  STM32F03xFx: {
    GPIOA:   'GPIO Bank A',
    GPIOB:   'GPIO Bank B',
    GPIOC:   'GPIO Bank C',
    GPIOD:   'GPIO Bank D',
    // (GPIO Bank E only available on F072 devices.)
    GPIOF:   'GPIO Bank F',
    TS:      'Touch-Sensing Controller',
    CRC:     'Cyclic Redundancy Check',
    FLITF:   'Sleep-Mode Flash Programming',
    SRAM:    'Static RAM Controller',
    DMA1:    'Direct Memory Access, Channel 1',
    DMA2:    'Direct Memory Access, Channel 2',
    SYSCFG:  'System Configuration',
    USART6:  'USART Bus 6',
    // TODO: USART 7-8 are on F031, but not F030.
    ADC1:    'Analog-Digital Converter, Channel 1',
    TIM1:    'Timer 1',
    SPI1:    'Serial Peripheral Interface 1',
    USART1:  'USART Bus 1',
    TIM15:   'Timer 15',
    TIM16:   'Timer 16',
    TIM17:   'Timer 17',
    DBGMCU:  'Debug Controller',
    TIM3:    'Timer 3',
    TIM6:    'Timer 6',
    TIM14:   'Timer 14',
    WWDG:    'Window-Watchdog Timer',
    SPI2:    'Serial Peripheral Interface 2',
    USART2:  'USART Bus 2',
    I2C1:    'Inter-IC Communication 1',
    I2C2:    'Inter-IC Communication 2',
    PWR:     'Power Controller',
    // TODO: CRS, CEC, DAC are on F031, but not F030.
  },
};