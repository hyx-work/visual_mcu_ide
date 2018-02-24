-- This module defines FSM node types.
local FSMNodeDefs = {}

FSMNodeDefs['Boot'] = require("modules/nodes/boot")
FSMNodeDefs['Delay'] = require("modules/nodes/delay")
FSMNodeDefs['GPIO_Init'] = require("modules/nodes/gpio_init")
FSMNodeDefs['GPIO_Output'] = require("modules/nodes/gpio_output")
FSMNodeDefs['GPIO_Input'] = require("modules/nodes/gpio_input")
FSMNodeDefs['RCC_Enable'] = require("modules/nodes/rcc_enable")
FSMNodeDefs['Set_Variable'] = require("modules/nodes/set_var")
FSMNodeDefs['Set_Var_Logic_Not'] = require("modules/nodes/set_var_logic_not")
FSMNodeDefs['Set_Var_Addition'] = require("modules/nodes/set_var_addition")
FSMNodeDefs['I2C_Init'] = require("modules/nodes/i2c_init")
FSMNodeDefs['ADC_Init'] = require("modules/nodes/adc_init")
FSMNodeDefs['ADC_Read'] = require("modules/nodes/adc_read")
FSMNodeDefs['RTC_Init'] = require("modules/nodes/rtc_init")
FSMNodeDefs['RTC_Read_Time'] = require("modules/nodes/rtc_read_time")
FSMNodeDefs['RTC_Read_Date'] = require("modules/nodes/rtc_read_date")
FSMNodeDefs['RTC_Set_Time'] = require("modules/nodes/rtc_set_time")
FSMNodeDefs['RTC_Set_Date'] = require("modules/nodes/rtc_set_date")
FSMNodeDefs['SSD1306_Init'] = require("modules/nodes/ssd1306_init")
FSMNodeDefs['SSD1306_Draw_Px'] = require("modules/nodes/ssd1306_draw_px")
FSMNodeDefs['SSD1306_Draw_HL'] = require("modules/nodes/ssd1306_draw_hline")
FSMNodeDefs['SSD1306_Draw_VL'] = require("modules/nodes/ssd1306_draw_vline")
FSMNodeDefs['SSD1306_Draw_Rect'] = require("modules/nodes/ssd1306_draw_rect")
FSMNodeDefs['SSD1306_Draw_Text'] = require("modules/nodes/ssd1306_draw_text")
FSMNodeDefs['SSD1306_Refresh'] = require("modules/nodes/ssd1306_refresh")
FSMNodeDefs['Check_Truthy'] = require("modules/nodes/check_truthy")
FSMNodeDefs['Check_Equals'] = require("modules/nodes/check_equals")

return FSMNodeDefs
