'use client';

import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useRouter } from 'next/navigation';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Tooltip from '@mui/material/Tooltip';

import MenuIcon from '@mui/icons-material/Menu';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import AutoAwesome from '@mui/icons-material/AutoAwesome';

export function Header() {
  const router = useRouter();
  const { user, logout, setLanguage } = useAuthStore();
  const { toggleAIPanel, setMobileSidebarOpen } = useUIStore();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (!user) return null;

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        zIndex: (theme) => theme.zIndex.appBar,
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, px: { xs: 1.5, sm: 3 } }}>
        {/* Mobile menu button */}
        <IconButton
          onClick={() => setMobileSidebarOpen(true)}
          sx={{ display: { sm: 'none' }, mr: 1 }}
          size="small"
        >
          <MenuIcon fontSize="small" />
        </IconButton>

        {/* Spacer */}
        <Box sx={{ flexGrow: 1 }} />

        {/* Right side actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1.5 } }}>
          {/* AI Assistant button */}
          <Button
            onClick={toggleAIPanel}
            startIcon={<AutoAwesome sx={{ fontSize: '18px !important' }} />}
            size="small"
            sx={{
              color: 'text.secondary',
              fontWeight: 500,
              fontSize: '0.8125rem',
              '&:hover': { color: 'primary.main', bgcolor: 'primary.main', backgroundColor: 'rgba(79,70,229,0.08)' },
            }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              AI Assistant
            </Box>
          </Button>

          {/* Language selector */}
          <FormControl size="small" sx={{ minWidth: 60 }}>
            <Select
              value={user.language || 'en'}
              onChange={(e) => setLanguage(e.target.value)}
              variant="outlined"
              sx={{
                height: 32,
                fontSize: '0.75rem',
                fontWeight: 500,
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'divider',
                },
                '& .MuiSelect-select': {
                  py: 0.5,
                  px: 1,
                },
              }}
            >
              <MenuItem value="en" sx={{ fontSize: '0.75rem' }}>EN</MenuItem>
              <MenuItem value="ar" sx={{ fontSize: '0.75rem' }}>AR</MenuItem>
              <MenuItem value="fr" sx={{ fontSize: '0.75rem' }}>FR</MenuItem>
              <MenuItem value="es" sx={{ fontSize: '0.75rem' }}>ES</MenuItem>
            </Select>
          </FormControl>

          {/* User info */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'primary.main',
                fontSize: '0.8125rem',
                fontWeight: 600,
              }}
            >
              {user.name?.charAt(0)?.toUpperCase() || 'U'}
            </Avatar>
            <Typography
              variant="body2"
              sx={{
                display: { xs: 'none', md: 'block' },
                color: 'text.primary',
                fontWeight: 500,
              }}
            >
              {user.name}
            </Typography>
          </Box>

          {/* Logout */}
          <Tooltip title="Sign out">
            <IconButton
              onClick={handleLogout}
              size="small"
              sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
            >
              <LogoutOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
