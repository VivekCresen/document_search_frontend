import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { tokenHasAdminRole } from '../services/auth-role.util';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html'
})
export class Login {
  username      = signal('');
  password      = signal('');
  error         = signal('');
  loading       = signal(false);
  showPassword  = signal(false);

  // Validation signals
  usernameError = signal('');
  passwordError = signal('');

  constructor(private router: Router, private api: ApiService) {}

  onUsernameChange(val: string) {
    this.username.set(val);
    if (this.usernameError()) {
      this.validate();
    }
  }

  onPasswordChange(val: string) {
    this.password.set(val);
    if (this.passwordError()) {
      this.validate();
    }
  }

  validate(): boolean {
    let isValid = true;
    
    // Validate Username / Email
    if (!this.username().trim()) {
      this.usernameError.set('Username or Email is required.');
      isValid = false;
    } else if (this.username().includes('@')) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
      if (!emailRegex.test(this.username().trim())) {
        this.usernameError.set('Please enter a valid email address.');
        isValid = false;
      } else {
        this.usernameError.set('');
      }
    } else {
      this.usernameError.set('');
    }

    // Validate Password
    if (!this.password().trim()) {
      this.passwordError.set('Password is required.');
      isValid = false;
    } else if (this.password().length < 6) {
      this.passwordError.set('Password must be at least 6 characters.');
      isValid = false;
    } else {
      this.passwordError.set('');
    }

    return isValid;
  }

  login() {
    if (!this.validate()) {
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.api.login({ userNameOrEmail: this.username().trim(), password: this.password() }).subscribe({
      next: (res) => {
        this.loading.set(false);
        localStorage.setItem('ds_current_user', res.userName ?? res.email ?? this.username());
        localStorage.setItem('ds_current_email', res.email ?? '');
        if (res.token) localStorage.setItem('ds_token', res.token);
        localStorage.setItem('ds_is_admin', String(tokenHasAdminRole(res.token ?? null)));
        if (res.id)    localStorage.setItem('ds_user_id', String(res.id));
        this.router.navigate(['/chat']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Invalid email or password.');
      }
    });
  }
}
